using MobileFPS.Combat;
using MobileFPS.Controls;
using MobileFPS.Core;
using MobileFPS.Effects;
using MobileFPS.Networking;
using MobileFPS.Weapons;
using UnityEngine;

namespace MobileFPS.Player
{
    /// <summary>
    /// Composition root and update orchestrator for the local first-person player.
    ///
    /// One Update and one LateUpdate drive every player subsystem in a fixed order:
    /// <code>
    /// Update:     input -> aim assist -> look -> movement -> weapons (fire uses this frame's aim)
    /// LateUpdate: camera effects (recoil, FOV, bob) -> viewmodel sway
    /// </code>
    /// Mobile performance: Unity's per-component Update has native-to-managed
    /// overhead, and ordering between separate Updates needs Script Execution
    /// Order hacks. Owning the loop here removes both problems. The subsystems
    /// (motor, camera, weapons, sway) expose Tick methods and have no Update of
    /// their own.
    /// </summary>
    [RequireComponent(typeof(FPSCharacterMotor), typeof(CombatEntity))]
    [DefaultExecutionOrder(-50)]
    public sealed class FPSPlayer : MonoBehaviour, IWeaponOwner
    {
        [SerializeField] private PlayerInputRouter input;
        [SerializeField] private FPSCameraController cameraController;
        [SerializeField] private WeaponSway sway;
        [SerializeField] private WeaponInventory weapons;
        [SerializeField] private AimAssistSettings aimAssistSettings;

        private FPSCharacterMotor _motor;
        private CombatEntity _entity;
        private Health _health;
        private AimAssist _aimAssist;
        private Vector2 _lastLook;
        private bool _previousAimHeld;
        private bool _autoFiring;
        private float _sprintBlend;

        public CombatEntity Entity => _entity;
        public Transform AimTransform => cameraController.AimTransform;
        public FPSCharacterMotor Motor => _motor;
        public FPSCameraController CameraController => cameraController;
        public WeaponInventory Weapons => weapons;
        public AimAssist AimAssist => _aimAssist;
        public PlayerInputRouter Input => input;
        public bool IsAlive => _health == null || !_health.IsDead;

        private void Awake()
        {
            _motor = GetComponent<FPSCharacterMotor>();
            _entity = GetComponent<CombatEntity>();
            _health = GetComponent<Health>();
            _aimAssist = new AimAssist(aimAssistSettings);
        }

        private void Start()
        {
            weapons.Equipped += OnWeaponEquipped;
            weapons.Initialize(this);
            if (_health != null) _health.Died += OnDied;

            if (_entity.IsLocalPlayer && cameraController.ViewCamera != null)
            {
                ImpactEffectSystem.Instance.SetViewer(cameraController.ViewCamera.transform);
            }
            ProjectileSystem.Instance.Exploded += OnExplosion;
            EventBus<PlayerSpawnedEvent>.Raise(new PlayerSpawnedEvent { Entity = _entity.Id, IsLocalPlayer = _entity.IsLocalPlayer });
        }

        private void OnDestroy()
        {
            if (weapons != null) weapons.Equipped -= OnWeaponEquipped;
            if (_health != null) _health.Died -= OnDied;
            if (ProjectileSystem.HasInstance) ProjectileSystem.Instance.Exploded -= OnExplosion;
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f || !IsAlive) return;

            PlayerInputFrame frame = input != null ? input.Current : default;
            WeaponController weapon = weapons.Current;
            float ads = weapon != null ? weapon.AdsBlend : 0f;

            // --- Look (before movement and firing so shots use this frame's aim) ---
            float scopeSensitivity = weapon != null ? weapon.Definition.handling.adsSensitivityMultiplier : 1f;
            float sensitivity = Mathf.Lerp(1f, cameraController.Settings.adsSensitivityMultiplier * scopeSensitivity, ads);
            bool aimJustPressed = frame.AimHeld && !_previousAimHeld;
            bool playerInputting = frame.Move.sqrMagnitude > 0.01f || frame.LookDegrees.sqrMagnitude > 1e-6f;
            float range = weapon != null ? weapon.Stats.MaxRange : 100f;

            AimAssist.Result assist = _aimAssist.Evaluate(AimTransform, _entity, ads, aimJustPressed, playerInputting, range, dt);
            _lastLook = frame.LookDegrees * (sensitivity * assist.SensitivityMultiplier) + assist.CorrectionDegrees;
            cameraController.ApplyLook(_lastLook);

            // --- Trigger (with optional auto-fire for casual players) ---
            bool autoFire = _aimAssist.ShouldAutoFire;
            bool fireHeld = frame.FireHeld || autoFire;
            bool firePressed = frame.FirePressed || (autoFire && !_autoFiring);
            _autoFiring = autoFire;

            // --- Movement (genre rules: firing or aiming cancels sprint) ---
            bool sprintBlocked = frame.AimHeld || fireHeld;
            if (sprintBlocked && _motor.IsSprinting) _motor.CancelSprint();

            _motor.Tick(new FPSCharacterMotor.MotorInput
            {
                Move = frame.Move,
                SprintHeld = frame.SprintHeld,
                JumpPressed = frame.JumpPressed,
                CrouchPressed = frame.CrouchPressed,
                SpeedMultiplier = weapon != null ? weapon.MoveSpeedMultiplier : 1f,
                SprintBlocked = sprintBlocked,
            }, dt);

            if (_motor.IsSprinting && input != null) input.CancelAimToggle(); // sprinting drops a tap-to-ADS latch

            // --- Weapons ---
            weapons.Tick(new WeaponTickContext
            {
                Input = new WeaponInput
                {
                    FireHeld = fireHeld,
                    FirePressed = firePressed,
                    AimHeld = frame.AimHeld && !_motor.IsSprinting,
                    ReloadPressed = frame.ReloadPressed,
                    SwitchPressed = frame.SwitchWeaponPressed,
                },
                IsSprinting = _motor.IsSprinting,
                IsGrounded = _motor.IsGrounded,
                IsCrouching = _motor.IsCrouching,
                IsSliding = _motor.IsSliding,
                Speed01 = _motor.Speed01,
                DeltaTime = dt,
            });

            // In loopback testing this process also plays server: mirror our state into it.
            if (CombatAuthority.HasInstance && CombatAuthority.Instance.IsServerSimulated)
            {
                CombatAuthority authority = CombatAuthority.Instance;
                authority.UpdateShooter(_entity.Id, AimTransform.position, _motor.Velocity.magnitude, IsAlive);
                // Covers switching authority mode at runtime (debug panel) after the weapon was drawn.
                if (weapon != null && authority.GetOrCreateShooter(_entity.Id).EquippedWeapon != weapon.NetworkId)
                {
                    authority.NotifyEquipped(_entity.Id, weapon.NetworkId, weapon.Stats, weapon.AmmoInMagazine);
                }
            }

            _previousAimHeld = frame.AimHeld;
        }

        private void LateUpdate()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            WeaponController weapon = weapons.Current;
            float ads = weapon != null ? weapon.AdsBlend : 0f;
            cameraController.AdsBlend = ads;
            cameraController.AdsFovMultiplier = weapon != null ? weapon.Stats.AdsFovMultiplier : 1f;
            cameraController.LateTick(_motor, dt);

            if (sway == null) return;
            _sprintBlend = Mathf.MoveTowards(_sprintBlend, _motor.IsSprinting ? 1f : 0f, dt * 6f);
            sway.Tick(new WeaponSway.SwayInput
            {
                LookDegrees = _lastLook,
                LocalVelocity = transform.InverseTransformDirection(_motor.Velocity),
                Grounded = _motor.IsGrounded,
                Landed = _motor.LandedThisFrame,
                LandingSpeed = _motor.LastLandingSpeed,
                AdsBlend = ads,
                SprintBlend = _sprintBlend,
                Sliding = _motor.IsSliding,
                MaxSpeed = _motor.Settings.sprintSpeed,
            }, dt);
        }

        public void ApplyRecoil(in RecoilKick kick)
        {
            cameraController.AddRecoil(kick.AimKickDegrees, kick.PermanentFraction);
            cameraController.AddPunch(kick.CameraPunch);
            if (kick.Trauma > 0f) cameraController.AddTrauma(kick.Trauma);
            if (sway != null) sway.AddRecoilKick(kick.ViewKickBack, kick.ViewKickUpDegrees, kick.ViewKickSideDegrees);
        }

        /// <summary>Respawn at a pose: full health, fresh ammo, no leftover motion or held inputs.</summary>
        public void Respawn(Vector3 position, Quaternion rotation)
        {
            _motor.Teleport(position, rotation);
            _motor.ResetMotion();
            cameraController.SetAngles(rotation.eulerAngles.y, 0f);
            if (_health != null) _health.Revive();
            weapons.ResetForRespawn();
            if (sway != null) sway.ResetSway();
            if (input != null)
            {
                input.ReleaseAll();
                input.Blocked = false;
            }
            EventBus<PlayerSpawnedEvent>.Raise(new PlayerSpawnedEvent { Entity = _entity.Id, IsLocalPlayer = _entity.IsLocalPlayer });
        }

        private void OnDied(DamageInfo info)
        {
            if (input != null) input.Blocked = true;
            WeaponController weapon = weapons.Current;
            if (weapon != null) weapon.CancelReload();
        }

        private void OnWeaponEquipped(WeaponController weapon)
        {
            // Idempotent subscription: controllers persist across re-equips.
            weapon.ReloadFinished -= OnReloadFinished;
            weapon.ReloadFinished += OnReloadFinished;

            if (CombatAuthority.HasInstance && CombatAuthority.Instance.IsServerSimulated)
            {
                CombatAuthority.Instance.NotifyEquipped(_entity.Id, weapon.NetworkId, weapon.Stats, weapon.AmmoInMagazine);
            }
        }

        private void OnReloadFinished(WeaponController weapon)
        {
            if (CombatAuthority.HasInstance && CombatAuthority.Instance.IsServerSimulated)
            {
                CombatAuthority.Instance.NotifyReloaded(_entity.Id, weapon.AmmoInMagazine);
            }
        }

        private void OnExplosion(Vector3 position, float radius)
        {
            float reach = radius * 3f;
            float distance = Vector3.Distance(position, transform.position);
            if (distance < reach) cameraController.AddTrauma(Mathf.Lerp(0.7f, 0f, distance / reach));
        }
    }
}
