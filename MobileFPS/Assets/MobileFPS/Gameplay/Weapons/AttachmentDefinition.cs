using System;
using UnityEngine;

namespace MobileFPS.Weapons
{
    public enum AttachmentSlot : byte
    {
        Muzzle,
        Barrel,
        Optic,
        Stock,
        Underbarrel,
        Magazine,
        RearGrip,
        Laser,
    }

    public enum WeaponStat : byte
    {
        DamageRange,        // + extends damage brackets
        AdsTime,            // - is faster
        HipSpread,          // - is tighter
        VerticalRecoil,     // - is less
        HorizontalRecoil,
        MoveSpeed,
        AdsMoveSpeed,
        MagazineSize,       // percent of base, rounded
        ReloadTime,         // - is faster
        SprintToFireTime,   // - is faster
        ProjectileSpeed,
        AdsZoom,            // + is more magnification
    }

    [Serializable]
    public struct StatModifier
    {
        public WeaponStat stat;
        [Tooltip("Percent change. -15 = 15% lower, +20 = 20% higher.")]
        public float percent;

        public StatModifier(WeaponStat stat, float percent)
        {
            this.stat = stat;
            this.percent = percent;
        }
    }

    /// <summary>
    /// Gunsmith attachment: pure stat trade-offs plus an optional visual. Every
    /// attachment should have a downside (e.g. +range / -ADS speed) so unlocks are
    /// choices rather than strict upgrades, which keeps build variety (and the
    /// weapon-level grind that unlocks them) meaningful.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Weapons/Attachment Definition", fileName = "Attachment_")]
    public sealed class AttachmentDefinition : ScriptableObject
    {
        public string attachmentId = "attachment_id";
        public string displayName = "Attachment";
        public AttachmentSlot slot = AttachmentSlot.Muzzle;

        [Tooltip("Weapon level required to equip. Weapon XP is earned by playing with the weapon.")]
        public int unlockWeaponLevel = 1;

        [Tooltip("Restrict to specific weapon ids. Empty = compatible with every weapon.")]
        public string[] compatibleWeaponIds = new string[0];

        public StatModifier[] modifiers = new StatModifier[0];
        public GameObject visualPrefab;

        public bool IsCompatibleWith(string weaponId)
        {
            if (compatibleWeaponIds == null || compatibleWeaponIds.Length == 0) return true;
            for (int i = 0; i < compatibleWeaponIds.Length; i++)
            {
                if (compatibleWeaponIds[i] == weaponId) return true;
            }
            return false;
        }
    }
}
