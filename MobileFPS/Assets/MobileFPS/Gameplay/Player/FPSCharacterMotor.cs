using System;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Player
{
    public enum Stance : byte
    {
        Standing,
        Crouching,
        Sliding,
    }

    /// <summary>
    /// Kinematic first-person movement on a CharacterController with custom
    /// velocity integration: walk, sprint, crouch, slide (with slope physics and
    /// slide-jump momentum), coyote time and jump buffering.
    ///
    /// Why CharacterController + our own physics rather than a Rigidbody:
    /// - Deterministic given (state, input, dt), which client-side prediction and
    ///   server reconciliation need. See <see cref="CaptureState"/> / <see cref="RestoreState"/>.
    /// - No rigidbody interpolation lag between physics and camera: the camera is
    ///   on the same transform, updated in the same frame as input. That is a big
    ///   part of "snappy".
    /// - One capsule sweep per frame instead of solver iterations, cheap on mobile CPUs.
    ///
    /// The motor has no Update of its own: <see cref="FPSPlayer"/> calls
    /// <see cref="Tick"/> so input -> look -> move -> shoot happens in a fixed order.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    [DisallowMultipleComponent]
    public sealed class FPSCharacterMotor : MonoBehaviour
    {
        /// <summary>Per-tick intent. Built by FPSPlayer from the input frame plus weapon modifiers.</summary>
        public struct MotorInput
        {
            public Vector2 Move;
            public bool SprintHeld;
            public bool JumpPressed;
            public bool CrouchPressed;

            /// <summary>Weapon weight x ADS slowdown. 1 = no penalty.</summary>
            public float SpeedMultiplier;

            /// <summary>True while ADS, reloading with a no-sprint rule, firing, etc.</summary>
            public bool SprintBlocked;
        }

        /// <summary>Everything needed to rewind and replay movement (client prediction).</summary>
        [Serializable]
        public struct MotorState
        {
            public Vector3 Position;
            public Vector3 Velocity;
            public Stance Stance;
            public bool Sprinting;
            public bool Grounded;
            public float Height;
            public float TimeSinceGrounded;
            public float JumpBufferTimer;
            public float SlideTimer;
            public float SlideCooldownTimer;
        }

        [SerializeField] private MovementSettings settings;

        [Tooltip("World geometry the player stands on. Must NOT include the player's own layer.")]
        [SerializeField] private LayerMask environmentMask = ~0;

        private CharacterController _controller;
        private Vector3 _velocity;
        private Vector3 _groundNormal = Vector3.up;
        private bool _grounded;
        private bool _wasGrounded;
        private float _timeSinceGrounded;
        private float _jumpBufferTimer;
        private bool _sprinting;
        private Stance _stance;
        private float _slideTimer;
        private float _slideCooldownTimer;
        private float _height;
        private float _strideAccumulator;

        public MovementSettings Settings => settings;
        public Vector3 Velocity => _velocity;
        public float HorizontalSpeed => new Vector2(_velocity.x, _velocity.z).magnitude;
        public bool IsGrounded => _grounded;
        public bool IsSprinting => _sprinting;
        public Stance Stance => _stance;
        public bool IsSliding => _stance == Stance.Sliding;
        public bool IsCrouching => _stance == Stance.Crouching;

        /// <summary>0 at rest, 1 at full sprint speed. Drives weapon bob, spread and FOV.</summary>
        public float Speed01 => settings != null ? Mathf.Clamp01(HorizontalSpeed / settings.sprintSpeed) : 0f;

        /// <summary>Camera pivot height above the feet for the current (smoothed) capsule height.</summary>
        public float EyeHeight => _height - (settings != null ? settings.eyeOffsetFromTop : 0.12f);

        public bool LandedThisFrame { get; private set; }
        public float LastLandingSpeed { get; private set; }
        public bool JumpedThisFrame { get; private set; }

        public event Action<float> Landed;      // impact speed (m/s)
        public event Action Jumped;
        public event Action SlideStarted;
        public event Action SlideEnded;
        public event Action Footstep;

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
            if (settings == null) settings = ScriptableObject.CreateInstance<MovementSettings>();
            _height = settings.standingHeight;
            ApplyCapsuleHeight();
        }

        public void Tick(in MotorInput input, float deltaTime)
        {
            if (deltaTime <= 0f || !_controller.enabled) return;

            LandedThisFrame = false;
            JumpedThisFrame = false;
            _slideCooldownTimer -= deltaTime;
            _jumpBufferTimer -= deltaTime;
            if (input.JumpPressed) _jumpBufferTimer = settings.jumpBufferTime;

            float verticalSpeedBeforeProbe = _velocity.y;
            ProbeGround();

            if (_grounded)
            {
                if (!_wasGrounded)
                {
                    LandedThisFrame = true;
                    LastLandingSpeed = Mathf.Max(0f, -verticalSpeedBeforeProbe);
                    Landed?.Invoke(LastLandingSpeed);
                }
                _timeSinceGrounded = 0f;
            }
            else
            {
                _timeSinceGrounded += deltaTime;
            }

            HandleStanceInput(input);
            UpdateSprint(input);
            HandleJump();

            Vector3 wishDirection = transform.right * input.Move.x + transform.forward * input.Move.y;
            wishDirection.y = 0f;
            float inputMagnitude = Mathf.Clamp01(input.Move.magnitude);
            if (wishDirection.sqrMagnitude > 1e-4f) wishDirection.Normalize();
            float wishSpeed = ComputeWishSpeed(input) * inputMagnitude;

            if (_stance == Stance.Sliding) UpdateSlide(wishDirection, deltaTime);
            else if (_grounded) GroundMove(wishDirection, wishSpeed, deltaTime);
            else AirMove(wishDirection, wishSpeed, deltaTime);

            // Vertical: stick to ground while grounded (keeps isGrounded stable on
            // slopes), otherwise integrate gravity.
            if (_grounded && !JumpedThisFrame) _velocity.y = -2f;
            else _velocity.y = Mathf.Max(_velocity.y - settings.gravity * deltaTime, -settings.maxFallSpeed);

            Vector3 before = transform.position;
            CollisionFlags flags = _controller.Move(_velocity * deltaTime);
            if ((flags & CollisionFlags.Above) != 0 && _velocity.y > 0f) _velocity.y = 0f; // bonk

            RemoveBlockedVelocity(before, deltaTime);
            SnapToGround();
            UpdateCapsuleHeight(deltaTime);
            UpdateFootsteps(deltaTime);

            _wasGrounded = _grounded;
        }

        /// <summary>Move instantly (spawn, respawn, reconciliation). Safe with Physics.autoSyncTransforms off.</summary>
        public void Teleport(Vector3 position, Quaternion rotation)
        {
            // Toggling the controller re-creates its physics shape at the new pose.
            // Setting transform.position alone is ignored by the next Move() when
            // autoSyncTransforms is disabled, which is a classic mobile-optimization gotcha.
            _controller.enabled = false;
            transform.SetPositionAndRotation(position, rotation);
            _controller.enabled = true;
            _velocity = Vector3.zero;
            _wasGrounded = false;
        }

        public void ResetMotion()
        {
            _velocity = Vector3.zero;
            _sprinting = false;
            _stance = Stance.Standing;
            _slideTimer = 0f;
            _jumpBufferTimer = 0f;
        }

        /// <summary>Forces sprint off this frame (firing, ADS, reload rules).</summary>
        public void CancelSprint() => _sprinting = false;

        public void AddImpulse(Vector3 velocityChange)
        {
            _velocity += velocityChange;
            if (velocityChange.y > 0f) _grounded = false;
        }

        public MotorState CaptureState()
        {
            return new MotorState
            {
                Position = transform.position,
                Velocity = _velocity,
                Stance = _stance,
                Sprinting = _sprinting,
                Grounded = _grounded,
                Height = _height,
                TimeSinceGrounded = _timeSinceGrounded,
                JumpBufferTimer = _jumpBufferTimer,
                SlideTimer = _slideTimer,
                SlideCooldownTimer = _slideCooldownTimer,
            };
        }

        public void RestoreState(in MotorState state)
        {
            Teleport(state.Position, transform.rotation);
            _velocity = state.Velocity;
            _stance = state.Stance;
            _sprinting = state.Sprinting;
            _grounded = state.Grounded;
            _wasGrounded = state.Grounded;
            _height = state.Height;
            _timeSinceGrounded = state.TimeSinceGrounded;
            _jumpBufferTimer = state.JumpBufferTimer;
            _slideTimer = state.SlideTimer;
            _slideCooldownTimer = state.SlideCooldownTimer;
            ApplyCapsuleHeight();
        }

        private void ProbeGround()
        {
            float radius = _controller.radius;
            const float castLift = 0.05f;
            // Bottom sphere center (pivot at the feet: center.y = height / 2).
            Vector3 origin = transform.position + Vector3.up * (radius + castLift);
            float distance = castLift + _controller.skinWidth + settings.groundProbeDistance;

            _grounded = false;
            _groundNormal = Vector3.up;
            if (Physics.SphereCast(origin, radius * 0.95f, Vector3.down, out RaycastHit hit, distance,
                    environmentMask, QueryTriggerInteraction.Ignore))
            {
                bool walkable = Vector3.Angle(hit.normal, Vector3.up) <= _controller.slopeLimit + 0.5f;
                bool movingUp = _velocity.y > 0.5f; // just jumped: not grounded yet
                if (walkable && !movingUp)
                {
                    _grounded = true;
                    _groundNormal = hit.normal;
                }
            }
        }

        private void HandleStanceInput(in MotorInput input)
        {
            if (!input.CrouchPressed) return;

            switch (_stance)
            {
                case Stance.Sliding:
                    EndSlide(); // tapping crouch mid-slide cancels into crouch
                    break;
                case Stance.Standing:
                    bool fastEnough = HorizontalSpeed >= settings.slideMinEntrySpeed;
                    if (_grounded && _sprinting && fastEnough && _slideCooldownTimer <= 0f) StartSlide();
                    else _stance = Stance.Crouching;
                    break;
                case Stance.Crouching:
                    if (CanStand()) _stance = Stance.Standing;
                    break;
            }
        }

        private void UpdateSprint(in MotorInput input)
        {
            bool wantsSprint = input.SprintHeld && !input.SprintBlocked
                               && input.Move.y >= settings.sprintForwardThreshold
                               && _stance != Stance.Sliding;

            // Sprinting from crouch stands the player up (if there's headroom).
            if (wantsSprint && _stance == Stance.Crouching && CanStand()) _stance = Stance.Standing;

            // Keep sprint through short airtime (jump while sprinting), but only start it grounded.
            _sprinting = wantsSprint && _stance == Stance.Standing && (_grounded || _sprinting);
        }

        private void HandleJump()
        {
            if (_jumpBufferTimer <= 0f) return;
            bool canJump = _grounded || _timeSinceGrounded <= settings.coyoteTime;
            if (!canJump) return;

            _jumpBufferTimer = 0f;

            if (_stance == Stance.Crouching)
            {
                // Genre convention: jump from crouch stands up instead of jumping.
                if (CanStand()) _stance = Stance.Standing;
                return;
            }

            if (_stance == Stance.Sliding)
            {
                // Slide-jump: keep the slide's momentum into the air. The skill
                // move that makes movement feel expressive.
                _stance = Stance.Standing;
                SlideEnded?.Invoke();
            }

            _velocity.y = Mathf.Sqrt(2f * settings.gravity * settings.jumpHeight);
            _grounded = false;
            _timeSinceGrounded = settings.coyoteTime + 1f; // consume coyote time
            JumpedThisFrame = true;
            Jumped?.Invoke();
        }

        private float ComputeWishSpeed(in MotorInput input)
        {
            float speed;
            switch (_stance)
            {
                case Stance.Crouching: speed = settings.crouchSpeed; break;
                case Stance.Sliding: speed = settings.crouchSpeed; break;
                default: speed = _sprinting ? settings.sprintSpeed : settings.walkSpeed; break;
            }

            float directional = 1f;
            if (input.Move.y < -0.1f) directional = settings.backwardMultiplier;
            else if (Mathf.Abs(input.Move.x) > Mathf.Abs(input.Move.y)) directional = settings.strafeMultiplier;

            float weapon = input.SpeedMultiplier > 0f ? input.SpeedMultiplier : 1f;
            // Sprint speed ignores ADS penalties (you can't ADS while sprinting) but keeps weapon weight.
            return speed * directional * weapon;
        }

        private void GroundMove(Vector3 wishDirection, float wishSpeed, float deltaTime)
        {
            Vector3 horizontal = new Vector3(_velocity.x, 0f, _velocity.z);
            Vector3 target = wishDirection * wishSpeed;
            float rate = wishSpeed > 0.01f ? settings.groundAcceleration : settings.groundDeceleration;
            horizontal = Vector3.MoveTowards(horizontal, target, rate * deltaTime);
            _velocity.x = horizontal.x;
            _velocity.z = horizontal.z;
        }

        private void AirMove(Vector3 wishDirection, float wishSpeed, float deltaTime)
        {
            Vector3 horizontal = new Vector3(_velocity.x, 0f, _velocity.z);
            if (wishSpeed > 0.01f)
            {
                // Steer without bleeding momentum: never decelerate below the current
                // speed in the air, so slide-jumps and sprint-jumps carry.
                float keepSpeed = Mathf.Max(wishSpeed, horizontal.magnitude);
                horizontal = Vector3.MoveTowards(horizontal, wishDirection * keepSpeed, settings.airAcceleration * deltaTime);
            }
            _velocity.x = horizontal.x;
            _velocity.z = horizontal.z;
        }

        private void StartSlide()
        {
            Vector3 horizontal = new Vector3(_velocity.x, 0f, _velocity.z);
            Vector3 direction = horizontal.sqrMagnitude > 0.01f ? horizontal.normalized : transform.forward;
            horizontal = direction * (horizontal.magnitude + settings.slideBoost);
            _velocity.x = horizontal.x;
            _velocity.z = horizontal.z;
            _stance = Stance.Sliding;
            _sprinting = false;
            _slideTimer = 0f;
            SlideStarted?.Invoke();
        }

        private void UpdateSlide(Vector3 wishDirection, float deltaTime)
        {
            _slideTimer += deltaTime;
            Vector3 horizontal = new Vector3(_velocity.x, 0f, _velocity.z);

            // Gravity along the slope: downhill slides accelerate, uphill slides die fast.
            Vector3 slopeDirection = Vector3.ProjectOnPlane(Vector3.down, _groundNormal); // |v| = sin(slope angle)
            slopeDirection.y = 0f;
            bool downhill = _grounded && slopeDirection.sqrMagnitude > 0.0025f && Vector3.Dot(slopeDirection, horizontal) > 0f;
            if (_grounded) horizontal += slopeDirection * (settings.slideSlopeAcceleration * deltaTime);

            float speed = Mathf.Max(0f, horizontal.magnitude - settings.slideFriction * deltaTime);
            Vector3 direction = horizontal.sqrMagnitude > 1e-4f ? horizontal.normalized : transform.forward;
            if (wishDirection.sqrMagnitude > 0.01f)
            {
                float maxRadians = settings.slideSteerDegreesPerSecond * Mathf.Deg2Rad * deltaTime;
                direction = Vector3.RotateTowards(direction, wishDirection, maxRadians, 0f);
            }
            horizontal = direction * speed;
            _velocity.x = horizontal.x;
            _velocity.z = horizontal.z;

            bool tooSlow = speed < settings.slideEndSpeed;
            bool expired = _slideTimer >= settings.slideMaxDuration && !downhill;
            bool leftGround = !_grounded && _timeSinceGrounded > 0.25f;
            if (tooSlow || expired || leftGround) EndSlide();
        }

        private void EndSlide()
        {
            if (_stance != Stance.Sliding) return;
            _stance = Stance.Crouching; // slides end low; sprint or crouch-tap to stand
            _slideCooldownTimer = settings.slideCooldown;
            SlideEnded?.Invoke();
        }

        private bool CanStand()
        {
            if (_height >= settings.standingHeight - 0.01f) return true;
            float radius = _controller.radius;
            Vector3 position = transform.position;
            // Only test the space the capsule would grow into, so the controller's own
            // current volume never counts as an obstruction.
            Vector3 bottom = position + Vector3.up * (_height - radius);
            Vector3 top = position + Vector3.up * (settings.standingHeight - radius);
            return !Physics.CheckCapsule(bottom, top, radius * 0.95f, environmentMask, QueryTriggerInteraction.Ignore);
        }

        private void RemoveBlockedVelocity(Vector3 before, float deltaTime)
        {
            // If a wall ate part of the horizontal motion, drop that part from the
            // velocity too. Otherwise sprinting into a wall "stores" speed that
            // launches the player sideways when they slide off its edge.
            Vector3 actual = transform.position - before;
            Vector3 intendedHorizontal = new Vector3(_velocity.x, 0f, _velocity.z) * deltaTime;
            Vector3 actualHorizontal = new Vector3(actual.x, 0f, actual.z);
            if (actualHorizontal.sqrMagnitude < intendedHorizontal.sqrMagnitude * 0.98f)
            {
                Vector3 corrected = actualHorizontal / deltaTime;
                _velocity.x = corrected.x;
                _velocity.z = corrected.z;
            }
        }

        private void SnapToGround()
        {
            if (!_wasGrounded || !_grounded || JumpedThisFrame || _velocity.y > 0f) return;

            float radius = _controller.radius;
            const float castLift = 0.05f;
            Vector3 origin = transform.position + Vector3.up * (radius + castLift);
            float maxDistance = castLift + settings.groundSnapDistance;
            if (!Physics.SphereCast(origin, radius * 0.95f, Vector3.down, out RaycastHit hit, maxDistance,
                    environmentMask, QueryTriggerInteraction.Ignore)) return;
            if (Vector3.Angle(hit.normal, Vector3.up) > _controller.slopeLimit + 0.5f) return;

            float gap = hit.distance - castLift - _controller.skinWidth;
            if (gap > 0.01f) _controller.Move(Vector3.down * gap);
        }

        private void UpdateCapsuleHeight(float deltaTime)
        {
            float target;
            switch (_stance)
            {
                case Stance.Crouching: target = settings.crouchHeight; break;
                case Stance.Sliding: target = settings.slideHeight; break;
                default: target = settings.standingHeight; break;
            }
            if (Mathf.Abs(_height - target) < 0.001f) return;
            _height = Smoothing.Damp(_height, target, settings.heightSharpness, deltaTime);
            ApplyCapsuleHeight();
        }

        private void ApplyCapsuleHeight()
        {
            if (_controller == null) return;
            float height = Mathf.Max(_height, _controller.radius * 2f);
            _controller.height = height;
            _controller.center = new Vector3(0f, height * 0.5f, 0f);
        }

        private void UpdateFootsteps(float deltaTime)
        {
            if (!_grounded || _stance == Stance.Sliding) return;
            float stride = _stance == Stance.Crouching ? settings.crouchStrideLength
                : _sprinting ? settings.sprintStrideLength : settings.walkStrideLength;
            _strideAccumulator += HorizontalSpeed * deltaTime;
            if (_strideAccumulator < stride) return;
            _strideAccumulator -= stride;
            Footstep?.Invoke();
        }
    }
}
