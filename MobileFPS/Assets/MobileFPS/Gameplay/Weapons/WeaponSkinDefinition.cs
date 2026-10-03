using UnityEngine;

namespace MobileFPS.Weapons
{
    public enum CosmeticRarity : byte
    {
        Common,
        Uncommon,
        Rare,
        Epic,
        Legendary,
        Mythic,
    }

    /// <summary>
    /// Purely cosmetic weapon skin, the core monetizable item. Skins must never
    /// touch stats: pay-to-win kills competitive retention and draws Play policy
    /// scrutiny. Ownership is tracked by the meta layer using <see cref="skinId"/>,
    /// which is also the store entitlement id.
    ///
    /// Mobile note: skins swap materials on the existing viewmodel instead of
    /// spawning a new mesh, so equipping one adds no draw calls. Share one
    /// texture atlas across rarities where possible to keep memory flat.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Weapons/Weapon Skin", fileName = "Skin_")]
    public sealed class WeaponSkinDefinition : ScriptableObject
    {
        public string skinId = "skin_id";
        public string displayName = "Skin";
        public string weaponId = "weapon_id";
        public CosmeticRarity rarity = CosmeticRarity.Rare;
        public Sprite icon;

        [Tooltip("Replaces the viewmodel's material(s). One entry per renderer material slot, or a single entry for all.")]
        public Material[] materials = new Material[0];

        [Tooltip("Legendary/Mythic tiers: optional custom tracer color, kill effect, etc.")]
        public Color tracerColor = new Color(1f, 0.85f, 0.4f, 1f);
    }
}
