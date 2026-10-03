using System;
using System.Collections.Generic;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Meta;
using MobileFPS.Profile;

namespace MobileFPS.Economy
{
    /// <summary>
    /// Owned cosmetics and entitlements (skins, charms, non-consumable purchases)
    /// and equipped skins. Ids are opaque strings: the gameplay layer maps a skin
    /// id to a WeaponSkinDefinition, so the meta layer never references art.
    /// </summary>
    public sealed class InventoryService
    {
        private readonly InventoryData _data;
        private readonly Action _markDirty;
        private readonly HashSet<string> _owned;

        public InventoryService(InventoryData data, Action markDirty)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _markDirty = markDirty;
            _owned = new HashSet<string>(_data.ownedItems, StringComparer.Ordinal);
        }

        public int Count => _owned.Count;
        public IReadOnlyList<string> OwnedItems => _data.ownedItems;

        public bool Owns(string itemId) => !string.IsNullOrEmpty(itemId) && _owned.Contains(itemId);

        /// <summary>Adds an item. Returns false if it was already owned (callers may convert duplicates to currency).</summary>
        public bool Add(string itemId, string source)
        {
            if (string.IsNullOrEmpty(itemId) || !_owned.Add(itemId)) return false;
            _data.ownedItems.Add(itemId);
            _markDirty?.Invoke();
            Telemetry.Log("item_granted", "item", itemId, "source", source);
            EventBus<ItemGrantedEvent>.Raise(new ItemGrantedEvent { ItemId = itemId, Source = source });
            return true;
        }

        public bool EquipSkin(string weaponId, string skinId)
        {
            if (string.IsNullOrEmpty(weaponId)) return false;
            if (!string.IsNullOrEmpty(skinId) && !Owns(skinId)) return false;

            for (int i = 0; i < _data.equippedSkins.Count; i++)
            {
                if (_data.equippedSkins[i].weaponId != weaponId) continue;
                _data.equippedSkins[i].skinId = skinId;
                _markDirty?.Invoke();
                return true;
            }
            _data.equippedSkins.Add(new EquippedSkinData { weaponId = weaponId, skinId = skinId });
            _markDirty?.Invoke();
            return true;
        }

        public string GetEquippedSkin(string weaponId)
        {
            for (int i = 0; i < _data.equippedSkins.Count; i++)
            {
                if (_data.equippedSkins[i].weaponId == weaponId) return _data.equippedSkins[i].skinId;
            }
            return null;
        }
    }
}
