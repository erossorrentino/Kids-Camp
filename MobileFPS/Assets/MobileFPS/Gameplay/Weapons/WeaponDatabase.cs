using System.Collections.Generic;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>
    /// Registry of every weapon, attachment and skin. Gives each weapon a compact
    /// network id (ushort, 2 bytes per shot packet instead of a string) and
    /// resolves the string ids that saves and the meta layer use.
    ///
    /// Network ids are list indices, so the list order is part of the wire
    /// protocol: only append, never reorder, or old clients will mismatch.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Weapons/Weapon Database", fileName = "WeaponDatabase")]
    public sealed class WeaponDatabase : ScriptableObject
    {
        public WeaponDefinition[] weapons = new WeaponDefinition[0];
        public AttachmentDefinition[] attachments = new AttachmentDefinition[0];
        public WeaponSkinDefinition[] skins = new WeaponSkinDefinition[0];

        private Dictionary<string, WeaponDefinition> _weaponsById;
        private Dictionary<WeaponDefinition, ushort> _networkIds;
        private Dictionary<string, AttachmentDefinition> _attachmentsById;
        private Dictionary<string, WeaponSkinDefinition> _skinsById;

        private void OnEnable() => _weaponsById = null; // rebuild lazily after domain reload / asset edits

        public bool TryGetWeapon(string weaponId, out WeaponDefinition definition)
        {
            EnsureLookups();
            return _weaponsById.TryGetValue(weaponId ?? string.Empty, out definition);
        }

        public bool TryGetAttachment(string attachmentId, out AttachmentDefinition definition)
        {
            EnsureLookups();
            return _attachmentsById.TryGetValue(attachmentId ?? string.Empty, out definition);
        }

        public bool TryGetSkin(string skinId, out WeaponSkinDefinition definition)
        {
            EnsureLookups();
            return _skinsById.TryGetValue(skinId ?? string.Empty, out definition);
        }

        public ushort GetNetworkId(WeaponDefinition definition)
        {
            EnsureLookups();
            return definition != null && _networkIds.TryGetValue(definition, out ushort id) ? id : ushort.MaxValue;
        }

        public WeaponDefinition GetByNetworkId(ushort networkId)
        {
            return networkId < weapons.Length ? weapons[networkId] : null;
        }

        /// <summary>Resolves saved attachment ids for a weapon, skipping unknown ones (content removed in an update).</summary>
        public void ResolveAttachments(IReadOnlyList<string> attachmentIds, List<AttachmentDefinition> results)
        {
            results.Clear();
            if (attachmentIds == null) return;
            for (int i = 0; i < attachmentIds.Count; i++)
            {
                if (TryGetAttachment(attachmentIds[i], out AttachmentDefinition attachment)) results.Add(attachment);
            }
        }

        private void EnsureLookups()
        {
            if (_weaponsById != null) return;
            _weaponsById = new Dictionary<string, WeaponDefinition>(weapons.Length);
            _networkIds = new Dictionary<WeaponDefinition, ushort>(weapons.Length);
            for (int i = 0; i < weapons.Length; i++)
            {
                WeaponDefinition weapon = weapons[i];
                if (weapon == null) continue;
                if (_weaponsById.ContainsKey(weapon.weaponId))
                {
                    Debug.LogError($"[WeaponDatabase] Duplicate weapon id '{weapon.weaponId}'.", this);
                    continue;
                }
                _weaponsById.Add(weapon.weaponId, weapon);
                _networkIds[weapon] = (ushort)i;
            }

            _attachmentsById = new Dictionary<string, AttachmentDefinition>(attachments.Length);
            foreach (AttachmentDefinition attachment in attachments)
            {
                if (attachment != null) _attachmentsById[attachment.attachmentId] = attachment;
            }

            _skinsById = new Dictionary<string, WeaponSkinDefinition>(skins.Length);
            foreach (WeaponSkinDefinition skin in skins)
            {
                if (skin != null) _skinsById[skin.skinId] = skin;
            }
        }
    }
}
