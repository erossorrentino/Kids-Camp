using MobileFPS.Progression;
using MobileFPS.LiveOps;
using UnityEngine;

namespace MobileFPS.Economy
{
    /// <summary>
    /// Applies a <see cref="RewardBundle"/> to the right services. Daily rewards,
    /// battle pass tiers, challenges, level-ups, store products and ad rewards all
    /// grant through this one path, so every reward is persisted, evented and
    /// logged the same way, and a new reward type is added in exactly one place.
    /// </summary>
    public sealed class RewardGranter
    {
        private readonly Wallet _wallet;
        private readonly InventoryService _inventory;
        private readonly ProgressionService _progression;
        private BattlePassService _battlePass;

        /// <summary>Credits granted instead when a duplicate cosmetic is awarded (no dead rewards).</summary>
        public int DuplicateItemCreditValue { get; set; } = 250;

        public RewardGranter(Wallet wallet, InventoryService inventory, ProgressionService progression)
        {
            _wallet = wallet;
            _inventory = inventory;
            _progression = progression;
        }

        /// <summary>Wired after construction because the battle pass itself grants through this granter.</summary>
        public void SetBattlePass(BattlePassService battlePass) => _battlePass = battlePass;

        /// <param name="multiplier">Scales stackable amounts (ad-boosted rewards). Items are never multiplied.</param>
        public void Grant(RewardBundle bundle, string source, int multiplier = 1)
        {
            if (bundle == null || bundle.IsEmpty) return;
            multiplier = Mathf.Max(1, multiplier);

            foreach (RewardItem item in bundle.items)
            {
                int amount = item.amount * multiplier;
                switch (item.type)
                {
                    case RewardType.Credits:
                        _wallet.Grant(CurrencyType.Credits, amount, source);
                        break;
                    case RewardType.Gems:
                        _wallet.Grant(CurrencyType.Gems, amount, source);
                        break;
                    case RewardType.AccountXp:
                        _progression?.AddAccountXp(amount, source);
                        break;
                    case RewardType.WeaponXp:
                        _progression?.AddWeaponXp(item.itemId, amount);
                        break;
                    case RewardType.BattlePassXp:
                        _battlePass?.AddXp(amount, source);
                        break;
                    case RewardType.DoubleXpMinutes:
                        _progression?.AddDoubleXpMinutes(amount);
                        break;
                    case RewardType.BattlePassPremium:
                        _battlePass?.UnlockPremium(source);
                        break;
                    case RewardType.Item:
                        if (!_inventory.Add(item.itemId, source))
                        {
                            _wallet.Grant(CurrencyType.Credits, DuplicateItemCreditValue, source + "_duplicate");
                        }
                        break;
                }
            }
        }
    }
}
