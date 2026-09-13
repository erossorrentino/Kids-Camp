using UnityEngine;
using CrimeCity.NPC;
using CrimeCity.Wanted;

namespace CrimeCity.Player
{
    /// <summary>
    /// Firing/melee logic. Damage numbers come from the equipped weapon's
    /// catalog entry (see WeaponDefinition.damage), so every one of the
    /// 800+ generated weapons behaves distinctly without per-weapon code.
    /// </summary>
    public class PlayerCombat : MonoBehaviour
    {
        [SerializeField] private Transform muzzlePoint;
        [SerializeField] private float range = 60f;
        [SerializeField] private LayerMask hitMask = ~0;
        [SerializeField] private int meleeDamage = 35;
        [SerializeField] private float meleeRange = 2f;

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

            FireRaycast(weapon.damage, isLethalWeapon: true);
        }

        private void DoMelee()
        {
            FireRaycast(meleeDamage, isLethalWeapon: false, overrideRange: meleeRange);
        }

        private void FireRaycast(int damage, bool isLethalWeapon, float overrideRange = -1f)
        {
            Vector3 origin = muzzlePoint != null ? muzzlePoint.position : transform.position + Vector3.up;
            Vector3 dir = muzzlePoint != null ? muzzlePoint.forward : transform.forward;
            float dist = overrideRange > 0f ? overrideRange : range;

            if (Physics.Raycast(origin, dir, out var hit, dist, hitMask))
            {
                var pedestrian = hit.collider.GetComponentInParent<PedestrianAI>();
                if (pedestrian != null && !pedestrian.IsDown)
                {
                    pedestrian.TakeDown();
                    return;
                }

                var lawResponder = hit.collider.GetComponentInParent<LawResponderAI>();
                if (lawResponder != null)
                {
                    WantedSystem.Instance?.ReportAssaultOnLaw();
                    Destroy(lawResponder.gameObject);
                }
            }
        }
    }
}
