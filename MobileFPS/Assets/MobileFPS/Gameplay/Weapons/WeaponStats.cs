using System.Collections.Generic;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>
    /// Final weapon numbers after attachments, computed once at equip and then
    /// read-only. Runtime code reads stats from here, never from
    /// <see cref="WeaponDefinition"/> plus ad-hoc multipliers, so client, server
    /// and UI stat bars agree by construction.
    /// </summary>
    public sealed class WeaponStats
    {
        public const int MaxAttachments = 5;

        public WeaponDefinition Definition { get; }
        public float RangeMultiplier { get; private set; } = 1f;
        public float AdsTime { get; private set; }
        public float HipSpreadMultiplier { get; private set; } = 1f;
        public float VerticalRecoilMultiplier { get; private set; } = 1f;
        public float HorizontalRecoilMultiplier { get; private set; } = 1f;
        public float MoveSpeedMultiplier { get; private set; }
        public float AdsMoveSpeedMultiplier { get; private set; }
        public int MagazineSize { get; private set; }
        public float ReloadTimeMultiplier { get; private set; } = 1f;
        public float SprintToFireTime { get; private set; }
        public float ProjectileSpeed { get; private set; }
        public float AdsFovMultiplier { get; private set; }

        private readonly List<AttachmentDefinition> _attachments = new List<AttachmentDefinition>(MaxAttachments);
        public IReadOnlyList<AttachmentDefinition> Attachments => _attachments;

        private WeaponStats(WeaponDefinition definition)
        {
            Definition = definition;
        }

        /// <summary>
        /// Builds stats for a loadout. Enforces one attachment per slot (last wins),
        /// weapon compatibility and the attachment cap; rejected attachments are skipped
        /// with a warning so a stale save can never break a match.
        /// </summary>
        public static WeaponStats Build(WeaponDefinition definition, IReadOnlyList<AttachmentDefinition> attachments = null)
        {
            var stats = new WeaponStats(definition);
            HandlingSettings handling = definition.handling;

            float range = 1f, ads = 1f, hip = 1f, vRecoil = 1f, hRecoil = 1f, move = 1f, adsMove = 1f;
            float magazine = 1f, reload = 1f, sprintToFire = 1f, projectileSpeed = 1f, zoom = 1f;

            if (attachments != null)
            {
                for (int i = 0; i < attachments.Count; i++)
                {
                    AttachmentDefinition attachment = attachments[i];
                    if (attachment == null) continue;
                    if (!attachment.IsCompatibleWith(definition.weaponId))
                    {
                        Debug.LogWarning($"[WeaponStats] {attachment.attachmentId} is not compatible with {definition.weaponId}; skipped.");
                        continue;
                    }
                    int existing = stats.IndexOfSlot(attachment.slot);
                    if (existing >= 0) stats._attachments[existing] = attachment;
                    else if (stats._attachments.Count < MaxAttachments) stats._attachments.Add(attachment);
                    else Debug.LogWarning($"[WeaponStats] Attachment cap ({MaxAttachments}) reached; {attachment.attachmentId} skipped.");
                }

                foreach (AttachmentDefinition attachment in stats._attachments)
                {
                    StatModifier[] modifiers = attachment.modifiers;
                    if (modifiers == null) continue;
                    for (int m = 0; m < modifiers.Length; m++)
                    {
                        float factor = 1f + modifiers[m].percent / 100f;
                        switch (modifiers[m].stat)
                        {
                            case WeaponStat.DamageRange: range *= factor; break;
                            case WeaponStat.AdsTime: ads *= factor; break;
                            case WeaponStat.HipSpread: hip *= factor; break;
                            case WeaponStat.VerticalRecoil: vRecoil *= factor; break;
                            case WeaponStat.HorizontalRecoil: hRecoil *= factor; break;
                            case WeaponStat.MoveSpeed: move *= factor; break;
                            case WeaponStat.AdsMoveSpeed: adsMove *= factor; break;
                            case WeaponStat.MagazineSize: magazine *= factor; break;
                            case WeaponStat.ReloadTime: reload *= factor; break;
                            case WeaponStat.SprintToFireTime: sprintToFire *= factor; break;
                            case WeaponStat.ProjectileSpeed: projectileSpeed *= factor; break;
                            case WeaponStat.AdsZoom: zoom *= factor; break;
                        }
                    }
                }
            }

            // Clamp to sane bounds so stacked modifiers can't produce degenerate guns.
            stats.RangeMultiplier = Mathf.Clamp(range, 0.5f, 2f);
            stats.AdsTime = Mathf.Max(0.05f, handling.adsTime * ads);
            stats.HipSpreadMultiplier = Mathf.Clamp(hip, 0.3f, 2f);
            stats.VerticalRecoilMultiplier = Mathf.Clamp(vRecoil, 0.3f, 2f);
            stats.HorizontalRecoilMultiplier = Mathf.Clamp(hRecoil, 0.3f, 2f);
            stats.MoveSpeedMultiplier = Mathf.Clamp(handling.moveSpeedMultiplier * move, 0.5f, 1.2f);
            stats.AdsMoveSpeedMultiplier = Mathf.Clamp(handling.adsMoveSpeedMultiplier * adsMove, 0.2f, 1f);
            stats.MagazineSize = Mathf.Max(1, Mathf.RoundToInt(definition.ammo.magazineSize * magazine));
            stats.ReloadTimeMultiplier = Mathf.Clamp(reload, 0.4f, 2f);
            stats.SprintToFireTime = Mathf.Max(0f, handling.sprintToFireTime * sprintToFire);
            stats.ProjectileSpeed = Mathf.Max(1f, definition.projectile.speed * projectileSpeed);
            // More zoom = smaller FOV multiplier.
            stats.AdsFovMultiplier = Mathf.Clamp(handling.adsFovMultiplier / Mathf.Max(0.1f, zoom), 0.1f, 1f);
            return stats;
        }

        /// <summary>Per-pellet damage at distance on a zone, after range attachments.</summary>
        public float DamageAt(float distance, HitZone zone)
        {
            float effectiveDistance = distance / RangeMultiplier;
            return Definition.GetBaseDamage(effectiveDistance) * Definition.zoneMultipliers.Get(zone);
        }

        public float MaxRange => Definition.maxRange * RangeMultiplier;

        private int IndexOfSlot(AttachmentSlot slot)
        {
            for (int i = 0; i < _attachments.Count; i++)
            {
                if (_attachments[i].slot == slot) return i;
            }
            return -1;
        }
    }
}
