using System;
using System.Collections.Generic;
using MobileFPS.Player;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>A loadout slot as stored by the meta layer: ids only, resolved through the <see cref="WeaponDatabase"/>.</summary>
    [Serializable]
    public sealed class LoadoutSlot
    {
        public string weaponId;
        public List<string> attachmentIds = new List<string>();
        public string skinId;
    }

    /// <summary>
    /// The weapons a character carries (primary + secondary), weapon switching,
    /// and viewmodel instantiation. Only the equipped weapon ticks.
    /// </summary>
    public sealed class WeaponInventory : MonoBehaviour
    {
        [SerializeField] private WeaponDatabase database;
        [Tooltip("Used when no loadout is applied (training range, bots).")]
        [SerializeField] private WeaponDefinition[] defaultWeapons = new WeaponDefinition[0];
        [Tooltip("Parent for viewmodels: the WeaponSway transform under the camera. Leave empty for bots/servers.")]
        [SerializeField] private Transform viewModelParent;
        [SerializeField] private WeaponSway sway;

        private readonly List<WeaponController> _weapons = new List<WeaponController>(2);
        private readonly List<AttachmentDefinition> _attachmentScratch = new List<AttachmentDefinition>(WeaponStats.MaxAttachments);
        private IWeaponOwner _owner;
        private int _currentIndex = -1;

        public WeaponDatabase Database => database;
        public WeaponController Current => _currentIndex >= 0 && _currentIndex < _weapons.Count ? _weapons[_currentIndex] : null;
        public IReadOnlyList<WeaponController> Weapons => _weapons;

        /// <summary>Raised after a weapon is drawn (UI swaps icons/ammo counters; authority resets cadence).</summary>
        public event Action<WeaponController> Equipped;

        public void Initialize(IWeaponOwner owner)
        {
            _owner = owner;
            if (_weapons.Count > 0) return;
            foreach (WeaponDefinition definition in defaultWeapons)
            {
                if (definition != null) Add(definition, null, null);
            }
            if (_weapons.Count > 0) Equip(0);
        }

        /// <summary>Replaces carried weapons with a meta-layer loadout (ids). Unknown ids are skipped safely.</summary>
        public void ApplyLoadout(IReadOnlyList<LoadoutSlot> slots)
        {
            if (database == null || slots == null) return;
            Clear();
            foreach (LoadoutSlot slot in slots)
            {
                if (slot == null || !database.TryGetWeapon(slot.weaponId, out WeaponDefinition definition)) continue;
                database.ResolveAttachments(slot.attachmentIds, _attachmentScratch);
                database.TryGetSkin(slot.skinId, out WeaponSkinDefinition skin);
                Add(definition, _attachmentScratch, skin);
            }
            if (_weapons.Count > 0) Equip(0);
        }

        public WeaponController Add(WeaponDefinition definition, IReadOnlyList<AttachmentDefinition> attachments, WeaponSkinDefinition skin)
        {
            WeaponStats stats = WeaponStats.Build(definition, attachments);
            WeaponView view = CreateView(definition);
            if (view != null) view.ApplySkin(skin);
            ushort networkId = database != null ? database.GetNetworkId(definition) : (ushort)_weapons.Count;
            var controller = new WeaponController(definition, stats, view, _owner, networkId);
            _weapons.Add(controller);
            return controller;
        }

        public void Equip(int index)
        {
            if (index < 0 || index >= _weapons.Count || index == _currentIndex) return;
            Current?.Holster();
            _currentIndex = index;
            WeaponController weapon = _weapons[index];
            weapon.Draw();
            if (sway != null && weapon.View != null) sway.AlignSights(weapon.View.SightAnchor, weapon.View.AdsSightDistance);
            Equipped?.Invoke(weapon);
        }

        public void EquipNext()
        {
            if (_weapons.Count > 1) Equip((_currentIndex + 1) % _weapons.Count);
        }

        public void Tick(in WeaponTickContext context)
        {
            if (context.Input.SwitchPressed) EquipNext();
            Current?.Tick(context);
        }

        /// <summary>Full ammo and a fresh draw (respawn).</summary>
        public void ResetForRespawn()
        {
            for (int i = 0; i < _weapons.Count; i++)
            {
                _weapons[i].CancelReload();
                _weapons[i].RefillAmmo();
            }
            if (_weapons.Count == 0) return;
            int index = Mathf.Max(0, _currentIndex);
            _currentIndex = -1;
            for (int i = 0; i < _weapons.Count; i++) _weapons[i].Holster();
            Equip(index);
        }

        private void Clear()
        {
            for (int i = 0; i < _weapons.Count; i++)
            {
                _weapons[i].Holster();
                if (_weapons[i].View != null) Destroy(_weapons[i].View.gameObject);
            }
            _weapons.Clear();
            _currentIndex = -1;
        }

        private WeaponView CreateView(WeaponDefinition definition)
        {
            GameObject prefab = definition.presentation.viewModelPrefab;
            if (prefab == null || viewModelParent == null) return null;
            GameObject instance = Instantiate(prefab, viewModelParent, false);
            instance.SetActive(false);
            if (!instance.TryGetComponent(out WeaponView view)) view = instance.AddComponent<WeaponView>();
            return view;
        }
    }
}
