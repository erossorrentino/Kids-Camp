using UnityEngine;
using CrimeCity.NPC;
using CrimeCity.Wanted;

namespace CrimeCity.Player
{
    /// <summary>
    /// Firing/melee logic. Damage numbers come from the equipped weapon's
    /// catalog entry (see WeaponDefinition.damage), so every one of the
    /// 900+ generated weapons behaves distinctly without per-weapon code.
    /// A handful of sci-fi weapons (see WeaponDefinition.specialEffect)
    /// get real mechanical differences instead of just a bigger number:
    /// chain lightning arcs to nearby targets, the freeze ray disables
    /// non-lethally instead of taking a pedestrian down, and EMP disables
    /// law enforcement without counting as an armed assault.
    /// </summary>
    public class PlayerCombat : MonoBehaviour
    {
        [SerializeField] private Transform muzzlePoint;
        [SerializeField] private float range = 60f;
        [SerializeField] private LayerMask hitMask = ~0;
        [SerializeField] private int meleeDamage = 35;
        [SerializeField] private float meleeRange = 2f;
        [SerializeField] private float chainLightningRadius = 5f;
        [SerializeField] private int chainLightningMaxExtraTargets = 2;
        [SerializeField] private float freezeRayDuration = 4f;

        private PlayerInventory _inventory;
        private float _fireCooldown;

        private void Awake()
        {
            _inventory = GetComponent<PlayerInventory>();
        }

        private void Update()
        {
            _fireCooldown -= Time.deltaTime;

            if (Input.GetKeyDown(KeyCode.Mouse1)) // melee, no weapon equipped
            {
                DoMelee();
            }
            else if (Input.GetButton("Fire1"))
            {
                TryFireEquipped();
            }
        }

        private void TryFireEquipped()
        {
            var weapon = _inventory != null ? _inventory.GetEquippedWeapon() : null;
            if (weapon == null) return;

            float interval = weapon.fireRateRps > 0f ? 1f / weapon.fireRateRps : 1f;
            if (_fireCooldown > 0f) return;
            _fireCooldown = interval;

            FireRaycast(weapon.damage, weapon.specialEffect);
        }

        private void DoMelee()
        {
            FireRaycast(meleeDamage, specialEffect: null, overrideRange: meleeRange);
        }

        private void FireRaycast(int damage, string specialEffect, float overrideRange = -1f)
        {
            Vector3 origin = muzzlePoint != null ? muzzlePoint.position : transform.position + Vector3.up;
            Vector3 dir = muzzlePoint != null ? muzzlePoint.forward : transform.forward;
            float dist = overrideRange > 0f ? overrideRange : range;

            if (!Physics.Raycast(origin, dir, out var hit, dist, hitMask)) return;

            ApplyHit(hit.collider, specialEffect);

            if (specialEffect == "chain_lightning")
            {
                ChainToNearbyTargets(hit.point);
            }
        }

        private void ApplyHit(Collider hitCollider, string specialEffect)
        {
            var pedestrian = hitCollider.GetComponentInParent<PedestrianAI>();
            if (pedestrian != null && !pedestrian.IsDown && !pedestrian.IsFrozen)
            {
                if (specialEffect == "freeze")
                {
                    pedestrian.Freeze(freezeRayDuration); // non-lethal: doesn't feed the wanted system
                }
                else
                {
                    pedestrian.TakeDown();
                }
                return;
            }

            var lawResponder = hitCollider.GetComponentInParent<LawResponderAI>();
            if (lawResponder != null)
            {
                // EMP disables without counting as an armed assault on law enforcement.
                if (specialEffect != "emp_disable")
                {
                    WantedSystem.Instance?.ReportAssaultOnLaw();
                }
                Destroy(lawResponder.gameObject);
            }
        }

        private void ChainToNearbyTargets(Vector3 fromPoint)
        {
            var hits = Physics.OverlapSphere(fromPoint, chainLightningRadius);
            int struckCount = 0;
            foreach (var hit in hits)
            {
                if (struckCount >= chainLightningMaxExtraTargets) break;

                var pedestrian = hit.GetComponentInParent<PedestrianAI>();
                if (pedestrian != null && !pedestrian.IsDown && !pedestrian.IsFrozen)
                {
                    pedestrian.TakeDown();
                    struckCount++;
                    continue;
                }

                var lawResponder = hit.GetComponentInParent<LawResponderAI>();
                if (lawResponder != null)
                {
                    WantedSystem.Instance?.ReportAssaultOnLaw();
                    Destroy(lawResponder.gameObject);
                    struckCount++;
                }
            }
        }
    }
}
