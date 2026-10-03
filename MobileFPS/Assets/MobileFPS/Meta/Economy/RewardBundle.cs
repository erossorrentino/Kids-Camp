using System;
using UnityEngine;

namespace MobileFPS.Economy
{
    public enum RewardType : byte
    {
        Credits,
        Gems,
        AccountXp,
        BattlePassXp,
        WeaponXp,           // itemId = weapon id
        Item,               // itemId = skin / charm / calling card / crate id
        DoubleXpMinutes,
        BattlePassPremium,
    }

    [Serializable]
    public struct RewardItem
    {
        public RewardType type;
        public int amount;
        [Tooltip("Item id for Item rewards, weapon id for WeaponXp.")]
        public string itemId;

        public RewardItem(RewardType type, int amount, string itemId = null)
        {
            this.type = type;
            this.amount = amount;
            this.itemId = itemId;
        }

        public static RewardItem Credits(int amount) => new RewardItem(RewardType.Credits, amount);
        public static RewardItem Gems(int amount) => new RewardItem(RewardType.Gems, amount);
        public static RewardItem AccountXp(int amount) => new RewardItem(RewardType.AccountXp, amount);
        public static RewardItem BattlePassXp(int amount) => new RewardItem(RewardType.BattlePassXp, amount);
        public static RewardItem Item(string itemId) => new RewardItem(RewardType.Item, 1, itemId);
        public static RewardItem DoubleXp(int minutes) => new RewardItem(RewardType.DoubleXpMinutes, minutes);
        public static RewardItem PremiumPass() => new RewardItem(RewardType.BattlePassPremium, 1);

        public override string ToString()
        {
            switch (type)
            {
                case RewardType.Item: return itemId;
                case RewardType.WeaponXp: return $"{amount} {itemId} XP";
                case RewardType.DoubleXpMinutes: return $"{amount} min 2XP";
                case RewardType.BattlePassPremium: return "Premium Pass";
                default: return $"{amount} {type}";
            }
        }
    }

    /// <summary>A designer-authored set of rewards: calendar days, battle pass tiers, store products, challenges.</summary>
    [Serializable]
    public sealed class RewardBundle
    {
        public RewardItem[] items = new RewardItem[0];

        public bool IsEmpty => items == null || items.Length == 0;

        public static RewardBundle Of(params RewardItem[] items) => new RewardBundle { items = items ?? new RewardItem[0] };

        /// <summary>Total of a reward type (e.g. gems in a pack) for UI and analytics.</summary>
        public long Sum(RewardType type)
        {
            if (items == null) return 0;
            long total = 0;
            for (int i = 0; i < items.Length; i++) if (items[i].type == type) total += items[i].amount;
            return total;
        }

        public override string ToString()
        {
            if (IsEmpty) return "(nothing)";
            return string.Join(", ", Array.ConvertAll(items, item => item.ToString()));
        }
    }
}
