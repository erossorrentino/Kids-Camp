using System;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Meta;
using MobileFPS.Profile;
using UnityEngine;

namespace MobileFPS.Economy
{
    public enum CurrencyType : byte
    {
        /// <summary>Soft currency, earned by playing. Spent on gunsmith unlocks, crates, rerolls.</summary>
        Credits,

        /// <summary>Premium currency, bought with real money (small amounts earnable). Spent on skins, battle pass, tier skips.</summary>
        Gems,
    }

    /// <summary>
    /// The only code allowed to change currency balances. Every change is
    /// validated, persisted, broadcast (UI updates) and logged with a reason
    /// (economy telemetry: the sources/sinks report is how you detect inflation
    /// before it wrecks the store).
    /// </summary>
    public sealed class Wallet
    {
        private readonly WalletData _data;
        private readonly Action _markDirty;

        public Wallet(WalletData data, Action markDirty)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _markDirty = markDirty;
        }

        public long Get(CurrencyType currency) => currency == CurrencyType.Gems ? _data.gems : _data.credits;

        public bool CanAfford(CurrencyType currency, long amount) => amount >= 0 && Get(currency) >= amount;

        public bool TrySpend(CurrencyType currency, long amount, string reason)
        {
            if (amount <= 0)
            {
                Debug.LogError($"[Wallet] Refusing non-positive spend of {amount} {currency} ({reason}).");
                return false;
            }
            if (!CanAfford(currency, amount)) return false;

            Set(currency, Get(currency) - amount);
            Telemetry.Log("currency_spent", "currency", currency, "amount", amount, "reason", reason);
            Notify(currency, -amount, reason);
            return true;
        }

        public void Grant(CurrencyType currency, long amount, string source)
        {
            if (amount <= 0)
            {
                if (amount < 0) Debug.LogError($"[Wallet] Refusing negative grant of {amount} {currency} ({source}).");
                return;
            }
            long current = Get(currency);
            long next = current > long.MaxValue - amount ? long.MaxValue : current + amount;
            Set(currency, next);
            Telemetry.Log("currency_earned", "currency", currency, "amount", amount, "source", source);
            Notify(currency, amount, source);
        }

        private void Set(CurrencyType currency, long value)
        {
            if (currency == CurrencyType.Gems) _data.gems = value;
            else _data.credits = value;
            _markDirty?.Invoke();
        }

        private void Notify(CurrencyType currency, long delta, string reason)
        {
            EventBus<CurrencyChangedEvent>.Raise(new CurrencyChangedEvent
            {
                Currency = currency,
                NewBalance = Get(currency),
                Delta = delta,
                Reason = reason,
            });
        }
    }
}
