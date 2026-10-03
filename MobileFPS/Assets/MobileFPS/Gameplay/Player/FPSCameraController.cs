using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Player
{
    /// <summary>
    /// First-person camera: look, procedural recoil, cosmetic punch/shake, landing
    /// dip, slide tilt and dynamic FOV.
    ///
    /// Hierarchy (built by the setup tool):
    /// <code>
    /// Player (yaw)                     &lt;- yawRoot, CharacterController
    ///  └ CameraPivot (pitch, eye height) &lt;- pitchPivot
    ///     └ AimPivot (recoil)            &lt;- aimPivot: bullets fire along this forward
    ///        └ Camera (punch, shake, roll, FOV)
    ///           └ WeaponHolder (sway)
    /// </code>
    /// Recoil lives on the aim pivot, so it moves where bullets go and the player
    /// has to pull down against it. Punch and shake live below the aim pivot on
    /// the camera: they sell impact but never move the shot. Mixing the two up is
    /// the classic way to make a shooter feel unfair.
    ///
    /// Every smoothing is exponential or closed-form-spring based, so it behaves
    /// the same at 30, 60 and 120 FPS.
    /// </summary>
    public sealed class FPSCameraController : MonoBehaviour
    {
        [SerializeField] private CameraSettings settings;
        [SerializeField] private Transform yawRoot;
        [SerializeField] private Transform pitchPivot;
        [SerializeField] private Transform aimPivot;
        [SerializeField] private Camera viewCamera;

        private float _yaw;
        private float _pitch;

        private Vector2 _recoilTarget;   // recoverable recoil offset (x = yaw right, y = pitch up), degrees
        private Vector2 _recoilCurrent;
        private float _timeSinceRecoil = 999f;

        private SpringVector3 _punch;     // euler degrees
        private SpringFloat _landingDip;  // meters
        private float _roll;
        private float _trauma;
        private float _bobDistance;
        private float _fovNoAds;
        private float _shakeSeed;

        public CameraSettings Settings => settings;
        public Camera ViewCamera => viewCamera;
        public Transform AimTransform => aimPivot;
        public float Yaw => _yaw;
        public float Pitch => _pitch;

        /// <summary>0-1 aim-down-sights blend, set by the player each frame (from the weapon).</summary>
        public float AdsBlend { get; set; }

        /// <summary>Weapon's ADS zoom: FOV multiplier at full ADS (0.8 = 1.25x zoom, 0.3 = sniper).</summary>
        public float AdsFovMultiplier { get; set; } = 0.82f;

        /// <summary>Current vertical FOV (needed to convert spread angles to crosshair pixels).</summary>
        public float CurrentFov => viewCamera != null ? viewCamera.fieldOfView : _fovNoAds;

        private void Awake()
        {
            if (settings == null) settings = ScriptableObject.CreateInstance<CameraSettings>();
            if (viewCamera == null) viewCamera = GetComponentInChildren<Camera>();
            _fovNoAds = settings.baseFov;
            _shakeSeed = Random.value * 100f;
            if (yawRoot != null) _yaw = yawRoot.eulerAngles.y;
        }

        /// <summary>Applies look input immediately (before movement and shooting this frame).</summary>
        public void ApplyLook(Vector2 lookDegrees)
        {
            _yaw = Mathf.Repeat(_yaw + lookDegrees.x, 360f);
            // Unity pitch: +X rotation looks down, so "look up" subtracts.
            _pitch = Mathf.Clamp(_pitch - lookDegrees.y, settings.minPitch, settings.maxPitch);
            ApplyRotations();
        }

        /// <summary>Sets absolute view angles (spawn, kill-cam handoff, reconciliation).</summary>
        public void SetAngles(float yaw, float pitch)
        {
            _yaw = yaw;
            _pitch = Mathf.Clamp(pitch, settings.minPitch, settings.maxPitch);
            _recoilTarget = _recoilCurrent = Vector2.zero;
            ApplyRotations();
        }

        /// <summary>
        /// Aim-affecting recoil from one shot.
        /// </summary>
        /// <param name="kickDegrees">x = horizontal (right +), y = vertical (up +).</param>
        /// <param name="permanentFraction">
        /// Share of the kick that permanently moves the aim (the player must pull down);
        /// the rest recovers automatically. ~0.3-0.5 rewards recoil control without
        /// punishing touch players, who can't counter-pull as precisely as a mouse.
        /// </param>
        public void AddRecoil(Vector2 kickDegrees, float permanentFraction)
        {
            permanentFraction = Mathf.Clamp01(permanentFraction);
            Vector2 permanent = kickDegrees * permanentFraction;
            _yaw = Mathf.Repeat(_yaw + permanent.x, 360f);
            _pitch = Mathf.Clamp(_pitch - permanent.y, settings.minPitch, settings.maxPitch);
            _recoilTarget += kickDegrees - permanent;
            _timeSinceRecoil = 0f;
            ApplyRotations();
        }

        /// <summary>Cosmetic camera kick. Values are roughly the peak rotation in degrees (x pitch, y yaw, z roll).</summary>
        public void AddPunch(Vector3 eulerDegrees) => _punch.AddImpulse(eulerDegrees * settings.punchFrequency);

        /// <summary>Adds screen-shake trauma (0-1). Shake intensity is trauma², so small hits barely register and explosions rock.</summary>
        public void AddTrauma(float amount) => _trauma = Mathf.Clamp01(_trauma + amount);

        /// <summary>Per-frame cosmetic update. Call from LateUpdate after movement.</summary>
        public void LateTick(FPSCharacterMotor motor, float deltaTime)
        {
            if (deltaTime <= 0f) return;
            UpdateRecoil(deltaTime);

            // Landing dip: a spring impulse proportional to impact speed.
            if (motor != null && motor.LandedThisFrame)
            {
                float dip = Mathf.Min(motor.LastLandingSpeed * settings.landingDipPerSpeed, settings.maxLandingDip);
                _landingDip.AddImpulse(-dip * settings.landingSpringFrequency);
                AddTrauma(motor.LastLandingSpeed >= motor.Settings.hardLandingSpeed ? 0.25f : 0f);
            }
            SpringCoefficients landingSpring = SpringCoefficients.Compute(settings.landingSpringFrequency, settings.landingSpringDamping, deltaTime);
            _landingDip.Step(0f, landingSpring);

            // Eye height + subtle bob (distance-based so it matches footsteps at any speed).
            float bob = 0f;
            if (motor != null && motor.IsGrounded && !motor.IsSliding)
            {
                _bobDistance += motor.HorizontalSpeed * deltaTime;
                float phase = _bobDistance / Mathf.Max(0.1f, settings.bobStrideLength) * Mathf.PI * 2f;
                bob = Mathf.Sin(phase * 2f) * settings.bobAmplitude * motor.Speed01 * (1f - AdsBlend);
            }
            float eyeHeight = motor != null ? motor.EyeHeight : 1.6f;
            if (pitchPivot != null) pitchPivot.localPosition = new Vector3(0f, eyeHeight + _landingDip.Value + bob, 0f);

            // Roll: lean into slides and (slightly) into strafes.
            float targetRoll = 0f;
            if (motor != null)
            {
                if (motor.IsSliding) targetRoll = settings.slideRollDegrees;
                else if (yawRoot != null)
                {
                    float lateral = Vector3.Dot(motor.Velocity, yawRoot.right) / Mathf.Max(0.1f, motor.Settings.sprintSpeed);
                    targetRoll = -lateral * settings.strafeRollDegrees;
                }
            }
            _roll = Smoothing.Damp(_roll, targetRoll, settings.rollSharpness, deltaTime);

            // Punch spring back to rest.
            SpringCoefficients punchSpring = SpringCoefficients.Compute(settings.punchFrequency, settings.punchDamping, deltaTime);
            _punch.Step(Vector3.zero, punchSpring);

            Vector3 shake = ComputeShake(deltaTime);
            if (viewCamera != null)
            {
                Vector3 cosmetic = _punch.Value + shake + new Vector3(0f, 0f, _roll);
                viewCamera.transform.localRotation = Quaternion.Euler(cosmetic);
                viewCamera.fieldOfView = ComputeFov(motor, deltaTime);
            }
        }

        private void UpdateRecoil(float deltaTime)
        {
            _timeSinceRecoil += deltaTime;
            if (_timeSinceRecoil > settings.recoilRecoveryDelay)
            {
                _recoilTarget = Smoothing.Damp(_recoilTarget, Vector2.zero, settings.recoilRecoverySharpness, deltaTime);
            }
            _recoilCurrent = Smoothing.Damp(_recoilCurrent, _recoilTarget, settings.recoilSnappiness, deltaTime);
            if (aimPivot != null) aimPivot.localRotation = Quaternion.Euler(-_recoilCurrent.y, _recoilCurrent.x, 0f);
        }

        private Vector3 ComputeShake(float deltaTime)
        {
            if (_trauma <= 0f) return Vector3.zero;
            _trauma = Mathf.Max(0f, _trauma - settings.traumaDecayPerSecond * deltaTime);
            float intensity = _trauma * _trauma;
            float t = Time.time * settings.shakeFrequency;
            // Perlin noise in [-1,1]: smooth, non-repeating, no per-frame randomness jitter.
            float nx = Mathf.PerlinNoise(_shakeSeed, t) * 2f - 1f;
            float ny = Mathf.PerlinNoise(_shakeSeed + 10f, t) * 2f - 1f;
            float nz = Mathf.PerlinNoise(_shakeSeed + 20f, t) * 2f - 1f;
            return Vector3.Scale(settings.maxShakeDegrees, new Vector3(nx, ny, nz)) * intensity;
        }

        private float ComputeFov(FPSCharacterMotor motor, float deltaTime)
        {
            float target = settings.baseFov;
            if (motor != null)
            {
                if (motor.IsSliding) target += settings.slideFovBoost;
                else if (motor.IsSprinting) target += settings.sprintFovBoost;
            }
            // Movement FOV is smoothed; ADS FOV follows the weapon's ADS blend directly,
            // so zoom stays locked to the ADS animation timing (crisp, no extra lag).
            _fovNoAds = Smoothing.Damp(_fovNoAds, target, settings.fovSharpness, deltaTime);
            float ads = AdsBlend * AdsBlend * (3f - 2f * AdsBlend); // smoothstep
            float fov = Mathf.Lerp(_fovNoAds, settings.baseFov * AdsFovMultiplier, ads);
            return settings.preserveHorizontalFovOnNarrowScreens ? AdjustForAspect(fov, viewCamera.aspect) : fov;
        }

        private void ApplyRotations()
        {
            if (yawRoot != null) yawRoot.localRotation = Quaternion.Euler(0f, _yaw, 0f);
            if (pitchPivot != null) pitchPivot.localRotation = Quaternion.Euler(_pitch, 0f, 0f);
        }

        /// <summary>Converts a vertical FOV authored for 16:9 so narrower screens keep the same horizontal FOV.</summary>
        public static float AdjustForAspect(float verticalFovAt16By9, float aspect)
        {
            const float referenceAspect = 16f / 9f;
            if (aspect >= referenceAspect || aspect <= 0f) return verticalFovAt16By9;
            float halfV = verticalFovAt16By9 * 0.5f * Mathf.Deg2Rad;
            float halfH = Mathf.Atan(Mathf.Tan(halfV) * referenceAspect);
            return 2f * Mathf.Atan(Mathf.Tan(halfH) / aspect) * Mathf.Rad2Deg;
        }
    }
}
