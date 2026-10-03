using System;
using MobileFPS.Core;
using MobileFPS.Networking;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>
    /// Runtime state machine for one carried weapon: trigger modes, fire cadence,
    /// ADS, reloads, spread bloom, recoil pattern, sprint-to-fire. Plain C# (not a
    /// MonoBehaviour): owned and ticked by <see cref="WeaponInventory"/>, so holstered
    /// weapons cost nothing per frame.
    ///
    /// Fire cadence uses an accumulator, not "one shot per frame if cooldown
    /// elapsed". At 900 RPM (15 shots/s) on a phone dipping to 25 FPS, the
    /// naive approach silently fires 25% slower. Here the timer carries its
    /// remainder and can fire several rounds in one long frame, so DPS is
    /// identical on every device. That is a competitive-fairness requirement.
    /// </summary>
    public sealed class WeaponController
    {
        private const int MaxShotsPerFrame = 4;
        private const float SemiAutoBufferSeconds = 0.12f;

        private readonly IWeaponOwner _owner;
        private readonly ushort _networkId;
        private DeterministicRandom _random;
        private uint _shotSequence;

        private float _shotTimer;           // <= 0: ready to fire
        private float _timeSinceLastShot = 999f;
        private int _shotIndex;             // position in the recoil pattern
        private int _burstRemaining;
        private float _semiAutoBuffer;
        private float _bloom;
        private float _sprintToFireTimer;
        private float _equipTimer;
        private float _adsBlend;
        private bool _reloading;
        private bool _reloadingFromEmpty;
        private float _reloadTimer;
        private int _roundsFired;

        public WeaponDefinition Definition { get; }
        public WeaponStats Stats { get; private set; }
        public WeaponView View { get; }
        public ushort NetworkId => _networkId;

        public int AmmoInMagazine { get; private set; }
        public int ReserveAmmo { get; private set; }
        public float AdsBlend => _adsBlend;
        public bool IsReloading => _reloading;
        public bool IsEquipped { get; private set; }

        /// <summary>Reload progress 0-1 for UI.</summary>
        public float ReloadProgress { get; private set; }

        /// <summary>Current spread half-angle in degrees, for the dynamic crosshair.</summary>
        public float CurrentSpreadDegrees { get; private set; }

        /// <summary>Movement multiplier: weapon weight blended with the ADS walk penalty.</summary>
        public float MoveSpeedMultiplier => Stats.MoveSpeedMultiplier * Mathf.Lerp(1f, Stats.AdsMoveSpeedMultiplier, _adsBlend);

        public event Action<WeaponController> Fired;
        public event Action<WeaponController> AmmoChanged;
        public event Action<WeaponController> ReloadStarted;
        public event Action<WeaponController> ReloadFinished;
        public event Action<WeaponController> DryFired;

        public WeaponController(WeaponDefinition definition, WeaponStats stats, WeaponView view, IWeaponOwner owner, ushort networkId)
        {
            Definition = definition;
            Stats = stats;
            View = view;
            _owner = owner;
            _networkId = networkId;
            uint ownerSeed = owner != null && owner.Entity != null ? (uint)owner.Entity.Id.Value : 1u;
            _random = new DeterministicRandom(DeterministicRandom.HashSeed(ownerSeed, DeterministicRandom.HashString(definition.weaponId)) ^ (uint)Environment.TickCount);
            RefillAmmo();
        }

        /// <summary>Swap stats (gunsmith change between lives). Keeps ammo within the new magazine size.</summary>
        public void SetStats(WeaponStats stats)
        {
            Stats = stats;
            AmmoInMagazine = Mathf.Min(AmmoInMagazine, stats.MagazineSize);
            AmmoChanged?.Invoke(this);
        }

        public void RefillAmmo()
        {
            AmmoInMagazine = Stats.MagazineSize;
            ReserveAmmo = Definition.ammo.startingReserve;
            AmmoChanged?.Invoke(this);
        }

        public void Draw()
        {
            IsEquipped = true;
            _equipTimer = Definition.handling.equipTime;
            _adsBlend = 0f;
            _bloom = 0f;
            _shotIndex = 0;
            _burstRemaining = 0;
            _shotTimer = Mathf.Max(_shotTimer, 0f);
            if (View != null)
            {
                View.gameObject.SetActive(true);
                View.PlayEquip();
            }
        }

        public void Holster()
        {
            IsEquipped = false;
            CancelReload();
            _adsBlend = 0f;
            if (View != null) View.gameObject.SetActive(false);
        }

        public void Tick(in WeaponTickContext context)
        {
            float dt = context.DeltaTime;
            if (dt <= 0f || !IsEquipped) return;

            _shotTimer -= dt;
            _timeSinceLastShot += dt;
            _equipTimer -= dt;
            _semiAutoBuffer -= dt;

            // Sprint-to-fire: the timer is held full while sprinting and drains after.
            if (context.IsSprinting) _sprintToFireTimer = Stats.SprintToFireTime;
            else _sprintToFireTimer -= dt;

            bool wantsAds = context.Input.AimHeld && !context.IsSprinting && _equipTimer <= 0f;
            _adsBlend = Mathf.MoveTowards(_adsBlend, wantsAds ? 1f : 0f, dt / Mathf.Max(0.01f, Stats.AdsTime));
            if (View != null) View.SetAim(_adsBlend);

            _bloom = Mathf.Max(0f, _bloom - Definition.spread.recoveryPerSecond * dt);
            if (_timeSinceLastShot > Definition.recoil.patternResetTime) _shotIndex = 0;

            if (context.Input.ReloadPressed) TryStartReload();
            UpdateReload(context, dt);
            HandleTrigger(context);

            CurrentSpreadDegrees = ComputeSpread(context);
        }

        public bool TryStartReload()
        {
            if (_reloading || AmmoInMagazine >= Stats.MagazineSize || ReserveAmmo <= 0) return false;

            _reloading = true;
            _reloadingFromEmpty = AmmoInMagazine == 0;
            HandlingSettings handling = Definition.handling;
            _reloadTimer = handling.perRoundReload
                ? handling.perRoundReloadTime * Stats.ReloadTimeMultiplier
                : (_reloadingFromEmpty ? handling.emptyReloadTime : handling.tacticalReloadTime) * Stats.ReloadTimeMultiplier;
            _burstRemaining = 0;
            if (View != null) View.PlayReload(_reloadingFromEmpty, Definition.presentation.reloadSound);
            ReloadStarted?.Invoke(this);
            return true;
        }

        public void CancelReload()
        {
            _reloading = false;
            ReloadProgress = 0f;
        }

        private void UpdateReload(in WeaponTickContext context, float dt)
        {
            if (!_reloading) return;
            HandlingSettings handling = Definition.handling;

            // Per-round reloads (shotguns) can be interrupted by firing: genre feel.
            if (handling.perRoundReload && AmmoInMagazine > 0 && (context.Input.FirePressed || context.Input.FireHeld))
            {
                CancelReload();
                return;
            }

            _reloadTimer -= dt;
            float total = handling.perRoundReload
                ? handling.perRoundReloadTime
                : (_reloadingFromEmpty ? handling.emptyReloadTime : handling.tacticalReloadTime);
            ReloadProgress = 1f - Mathf.Clamp01(_reloadTimer / Mathf.Max(0.01f, total * Stats.ReloadTimeMultiplier));
            if (_reloadTimer > 0f) return;

            if (handling.perRoundReload)
            {
                AmmoInMagazine++;
                ReserveAmmo--;
                AmmoChanged?.Invoke(this);
                if (AmmoInMagazine < Stats.MagazineSize && ReserveAmmo > 0)
                {
                    _reloadTimer += handling.perRoundReloadTime * Stats.ReloadTimeMultiplier;
                    return;
                }
            }
            else
            {
                int taken = Mathf.Min(Stats.MagazineSize - AmmoInMagazine, ReserveAmmo);
                AmmoInMagazine += taken;
                ReserveAmmo -= taken;
                AmmoChanged?.Invoke(this);
            }

            _reloading = false;
            ReloadProgress = 0f;
            ReloadFinished?.Invoke(this);
        }

        private void HandleTrigger(in WeaponTickContext context)
        {
            WeaponInput input = context.Input;
            bool wantsFire;
            switch (Definition.fireMode)
            {
                case FireMode.SemiAuto:
                    // Buffer taps slightly early so fast tapping never feels "eaten".
                    if (input.FirePressed) _semiAutoBuffer = SemiAutoBufferSeconds;
                    wantsFire = _semiAutoBuffer > 0f;
                    break;
                case FireMode.Burst:
                    if (input.FirePressed && _burstRemaining == 0) _burstRemaining = Definition.burstCount;
                    wantsFire = _burstRemaining > 0;
                    break;
                default:
                    wantsFire = input.FireHeld;
                    break;
            }

            if (!wantsFire)
            {
                if (_shotTimer < 0f) _shotTimer = 0f; // never bank shots while idle
                return;
            }

            if (AmmoInMagazine <= 0)
            {
                _burstRemaining = 0;
                if (input.FirePressed)
                {
                    if (View != null) View.PlayDryFire(Definition.presentation.dryFireSound);
                    DryFired?.Invoke(this);
                }
                TryStartReload(); // auto-reload on empty: mobile players shouldn't need a reload button
                return;
            }

            bool blocked = _equipTimer > 0f || _sprintToFireTimer > 0f || (_reloading && !Definition.handling.perRoundReload);
            if (blocked)
            {
                if (_shotTimer < 0f) _shotTimer = 0f;
                return;
            }

            if (_reloading) CancelReload(); // shotgun: firing interrupts the per-round reload

            int shots = 0;
            // Bound catch-up so a multi-second hitch can't dump a magazine in one frame.
            if (_shotTimer < -Definition.SecondsBetweenShots) _shotTimer = -Definition.SecondsBetweenShots;

            while (_shotTimer <= 0f && AmmoInMagazine > 0 && shots < MaxShotsPerFrame)
            {
                FireOneShot(context);
                shots++;

                if (Definition.fireMode == FireMode.Burst)
                {
                    _shotTimer += Definition.SecondsBetweenBurstShots;
                    _burstRemaining--;
                    if (_burstRemaining <= 0)
                    {
                        _shotTimer = Mathf.Max(_shotTimer, Definition.burstCooldown);
                        break;
                    }
                }
                else
                {
                    _shotTimer += Definition.SecondsBetweenShots;
                    if (Definition.fireMode == FireMode.SemiAuto)
                    {
                        _semiAutoBuffer = 0f;
                        break;
                    }
                }
            }
        }

        private void FireOneShot(in WeaponTickContext context)
        {
            AmmoInMagazine--;
            _roundsFired++;
            _timeSinceLastShot = 0f;

            Transform aim = _owner.AimTransform;
            float spread = ComputeSpread(context);

            ShotFlags flags = ShotFlags.None;
            if (_adsBlend > 0.5f) flags |= ShotFlags.Aiming;
            if (context.IsSliding) flags |= ShotFlags.Sliding;
            if (!context.IsGrounded) flags |= ShotFlags.Airborne;
            if (context.IsCrouching) flags |= ShotFlags.Crouched;

            var shot = new ShotRequest
            {
                Sequence = ++_shotSequence,
                Shooter = _owner.Entity != null ? _owner.Entity.Id : EntityId.None,
                WeaponNetId = _networkId,
                ViewTime = NetworkClock.ViewTime,
                Origin = aim.position,
                Direction = aim.forward,
                SpreadDegrees = spread,
                Seed = _random.NextUInt(),
                Flags = flags,
            };

            if (Definition.projectile.useProjectile)
            {
                Vector3 direction = SpreadPattern.Apply(shot.Direction, spread, shot.Seed, 0);
                Vector3 origin = View != null ? View.Muzzle.position : shot.Origin;
                ProjectileSystem.Instance.Launch(Definition, Stats, shot.Shooter, origin, direction, shot.Origin);
            }
            else
            {
                int tracerEvery = Definition.presentation.tracerEveryNthRound;
                var presentation = new ShotPresentation
                {
                    MuzzlePosition = View != null ? View.Muzzle.position : shot.Origin,
                    DrawTracer = tracerEvery > 0 && _roundsFired % tracerEvery == 0,
                    TracerColor = View != null ? View.TracerColor : Color.yellow,
                    ImpactLibrary = Definition.presentation.impactOverride,
                };
                CombatAuthority.Instance.SubmitShot(shot, Stats, presentation);
            }

            // Bloom grows only from hip-fire; ADS spread stays tight.
            float bloomCap = Mathf.Max(0f, Definition.spread.hipMax - Definition.spread.hipMin);
            _bloom = Mathf.Min(_bloom + Definition.spread.perShot * (1f - _adsBlend), bloomCap);

            ApplyRecoil();
            if (View != null) View.PlayFire(Definition.presentation.fireSound, Definition.presentation.fireVolume);
            AmmoChanged?.Invoke(this);
            Fired?.Invoke(this);
        }

        private void ApplyRecoil()
        {
            RecoilSettings recoil = Definition.recoil;
            Vector2 kick = recoil.pattern != null ? recoil.pattern.GetKick(_shotIndex, ref _random) : new Vector2(0f, 1f);
            _shotIndex++;

            float scale = recoil.scale * Mathf.Lerp(1f, recoil.adsMultiplier, _adsBlend);
            kick.x *= Stats.HorizontalRecoilMultiplier * scale;
            kick.y *= Stats.VerticalRecoilMultiplier * scale;

            float side = _random.Range(-1f, 1f);
            _owner.ApplyRecoil(new RecoilKick
            {
                AimKickDegrees = kick,
                PermanentFraction = recoil.permanentFraction,
                ViewKickBack = recoil.viewKickBack,
                ViewKickUpDegrees = recoil.viewKickUpDegrees * Stats.VerticalRecoilMultiplier,
                ViewKickSideDegrees = recoil.viewKickSideDegrees * side,
                CameraPunch = new Vector3(-recoil.cameraPunchDegrees, recoil.cameraPunchDegrees * 0.35f * side, 0f),
                Trauma = recoil.traumaPerShot,
            });
        }

        private float ComputeSpread(in WeaponTickContext context)
        {
            SpreadSettings spread = Definition.spread;
            float hip = (spread.hipMin + _bloom) * Stats.HipSpreadMultiplier;
            hip += spread.movePenalty * context.Speed01;
            if (!context.IsGrounded) hip += spread.airPenalty;
            if (context.IsSliding) hip *= spread.slideMultiplier;
            else if (context.IsCrouching) hip *= spread.crouchMultiplier;

            float ads = spread.ads + spread.movePenalty * 0.1f * context.Speed01;
            // Squared blend: precision arrives near the end of the ADS transition, so
            // quick-scoping (firing mid-transition) is weaker than a settled aim.
            return Mathf.Lerp(hip, ads, _adsBlend * _adsBlend);
        }
    }
}
