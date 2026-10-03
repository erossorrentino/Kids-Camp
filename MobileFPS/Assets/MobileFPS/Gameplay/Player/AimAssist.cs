using MobileFPS.Combat;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Player
{
    /// <summary>
    /// Touch aim assist: friction, magnetism and ADS snap, the main reason a
    /// mobile shooter feels "snappy" instead of fighting the glass.
    ///
    /// Cost: one pass over <see cref="HitboxRig.All"/> (a dozen entries, no
    /// physics), plus at most one throttled line-of-sight raycast for the chosen
    /// target. There is no OverlapSphere, no GetComponent, and no allocation.
    ///
    /// Fairness: assist is tuned for touch. In an online game, matchmake touch and
    /// controller players separately or give controllers their own profile.
    /// </summary>
    public sealed class AimAssist
    {
        public struct Result
        {
            public float SensitivityMultiplier;
            public Vector2 CorrectionDegrees;   // look units: x yaw right+, y pitch up+
            public HitboxRig Target;
            public bool CrosshairOnTarget;
        }

        private readonly AimAssistSettings _settings;
        private HitboxRig _losTarget;
        private float _losCheckedAt = -999f;
        private bool _losVisible;
        private HitboxRig _snapTarget;
        private float _snapRemaining;
        private float _onTargetTime;

        public AimAssist(AimAssistSettings settings)
        {
            _settings = settings != null ? settings : ScriptableObject.CreateInstance<AimAssistSettings>();
        }

        public AimAssistSettings Settings => _settings;

        public Result Evaluate(Transform aim, CombatEntity self, float adsBlend, bool adsJustStarted,
            bool playerIsInputting, float weaponRange, float deltaTime)
        {
            var result = new Result { SensitivityMultiplier = 1f };
            if (!_settings.enabled || aim == null || deltaTime <= 0f)
            {
                _onTargetTime = 0f;
                return result;
            }

            Vector3 origin = aim.position;
            Vector3 forward = aim.forward;
            float maxDistance = Mathf.Min(_settings.maxDistance, weaponRange);

            HitboxRig best = null;
            float bestScore = float.MaxValue;
            float bestAngle = 0f;
            Vector3 bestToTarget = Vector3.zero;

            var rigs = HitboxRig.All;
            for (int i = 0; i < rigs.Count; i++)
            {
                HitboxRig rig = rigs[i];
                if (!rig.IsAlive || rig.Entity == self || (self != null && !self.IsHostileTo(rig.Entity))) continue;

                Vector3 toTarget = rig.AimPointPosition - origin;
                float distance = toTarget.magnitude;
                if (distance < 0.5f || distance > maxDistance) continue;

                float angle = Vector3.Angle(forward, toTarget);
                float cone = Mathf.Clamp(Mathf.Atan(_settings.assistRadiusMeters / distance) * Mathf.Rad2Deg,
                    _settings.minConeDegrees, _settings.maxConeDegrees);
                if (angle > cone) continue;

                float score = angle / cone; // 0 = dead center
                if (score < bestScore)
                {
                    bestScore = score;
                    best = rig;
                    bestAngle = angle;
                    bestToTarget = toTarget;
                }
            }

            if (best == null || !HasLineOfSight(origin, best, bestToTarget))
            {
                _snapTarget = null;
                _onTargetTime = 0f;
                return result;
            }

            result.Target = best;
            float strength = 1f - bestScore;

            float friction = Mathf.Lerp(_settings.hipFriction, _settings.adsFriction, adsBlend) * strength;
            result.SensitivityMultiplier = 1f - friction;

            Vector2 error = AngularError(aim, bestToTarget);
            if (!_settings.requirePlayerInput || playerIsInputting)
            {
                float pullRate = Mathf.Lerp(_settings.hipPullDegreesPerSecond, _settings.adsPullDegreesPerSecond, adsBlend) * strength;
                result.CorrectionDegrees = Vector2.ClampMagnitude(error, pullRate * deltaTime);
            }

            if (_settings.adsSnap && adsJustStarted && bestAngle <= _settings.adsSnapConeDegrees)
            {
                _snapTarget = best;
                _snapRemaining = _settings.adsSnapDuration;
            }
            if (_snapTarget == best && _snapRemaining > 0f)
            {
                // Ease out over the snap window: a fraction of the remaining error each frame.
                float portion = Mathf.Clamp01(deltaTime / _snapRemaining) * _settings.adsSnapStrength;
                result.CorrectionDegrees = error * portion;
                _snapRemaining -= deltaTime;
            }

            // Crosshair-on-target for auto-fire: an actual ray vs hitboxes, not the cone.
            result.CrosshairOnTarget = best.Raycast(origin, forward, maxDistance, out _);
            _onTargetTime = result.CrosshairOnTarget ? _onTargetTime + deltaTime : 0f;
            return result;
        }

        /// <summary>True when auto-fire should pull the trigger this frame.</summary>
        public bool ShouldAutoFire => _settings.autoFireEnabled && _onTargetTime >= _settings.autoFireDelay;

        private bool HasLineOfSight(Vector3 origin, HitboxRig target, Vector3 toTarget)
        {
            if (target == _losTarget && Time.time - _losCheckedAt < _settings.lineOfSightInterval) return _losVisible;

            _losTarget = target;
            _losCheckedAt = Time.time;
            float distance = toTarget.magnitude;
            // Stop a little short so the target's own environment contact doesn't count.
            _losVisible = !Physics.Raycast(origin, toTarget / distance, distance - 0.3f, _settings.occlusionMask, QueryTriggerInteraction.Ignore);
            return _losVisible;
        }

        /// <summary>Yaw/pitch (look units) needed to point <paramref name="aim"/> at a world direction.</summary>
        public static Vector2 AngularError(Transform aim, Vector3 worldDirection)
        {
            Vector3 local = aim.InverseTransformDirection(worldDirection);
            float yaw = Mathf.Atan2(local.x, local.z) * Mathf.Rad2Deg;
            float pitch = Mathf.Atan2(local.y, new Vector2(local.x, local.z).magnitude) * Mathf.Rad2Deg;
            return new Vector2(yaw, pitch);
        }
    }
}
