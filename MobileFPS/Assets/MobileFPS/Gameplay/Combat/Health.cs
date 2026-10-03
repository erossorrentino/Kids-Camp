using System;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Combat
{
    /// <summary>Everything about one application of damage. Plain struct: no allocation per hit.</summary>
    public struct DamageInfo
    {
        public float Amount;
        public EntityId Attacker;
        public EntityId Victim;
        public string WeaponId;
        public WeaponClass WeaponClass;
        public HitZone Zone;
        public Vector3 Point;
        public Vector3 Direction;
        public Vector3 SourcePosition;
        public float Distance;
        public KillFlags Flags;
    }

    /// <summary>
    /// Health with genre-standard regeneration: after a short delay out of
    /// combat, health refills fast. That keeps the engagement loop tight (fight,
    /// reposition, fight again) without health packs.
    ///
    /// Mobile trick: the component disables itself at full health, so Unity skips
    /// its Update entirely. With 10+ characters that is 10+ fewer
    /// native-to-managed calls per frame for most of the match.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class Health : MonoBehaviour
    {
        [SerializeField] private float maxHealth = 100f;
        [SerializeField] private bool regenerate = true;
        [SerializeField] private float regenDelay = 4f;
        [SerializeField] private float regenPerSecond = 45f;

        private float _current;
        private float _lastDamageTime = -999f;
        private bool _dead;

        public float Current => _current;
        public float Max => maxHealth;
        public float Normalized => maxHealth > 0f ? _current / maxHealth : 0f;
        public bool IsDead => _dead;
        public EntityId LastAttacker { get; private set; }

        /// <summary>(info, appliedAmount)</summary>
        public event Action<DamageInfo, float> Damaged;
        public event Action<DamageInfo> Died;
        public event Action Revived;

        private void Awake()
        {
            _current = maxHealth;
            enabled = false; // full health: no Update needed
        }

        /// <summary>Applies damage and returns the amount actually removed. Call via <see cref="DamageSystem"/> so events fire.</summary>
        public float ApplyDamage(in DamageInfo info)
        {
            if (_dead || info.Amount <= 0f) return 0f;

            float applied = Mathf.Min(_current, info.Amount);
            _current -= applied;
            _lastDamageTime = Time.time;
            LastAttacker = info.Attacker;
            if (regenerate) enabled = true;

            Damaged?.Invoke(info, applied);

            if (_current <= 0f)
            {
                _current = 0f;
                _dead = true;
                enabled = false;
                Died?.Invoke(info);
            }
            return applied;
        }

        public void Revive(float normalizedHealth = 1f)
        {
            _current = Mathf.Clamp01(normalizedHealth) * maxHealth;
            _dead = false;
            LastAttacker = EntityId.None;
            enabled = regenerate && _current < maxHealth;
            Revived?.Invoke();
        }

        private void Update()
        {
            if (_dead || Time.time - _lastDamageTime < regenDelay) return;
            _current = Mathf.Min(maxHealth, _current + regenPerSecond * Time.deltaTime);
            if (_current >= maxHealth) enabled = false;
        }
    }
}
