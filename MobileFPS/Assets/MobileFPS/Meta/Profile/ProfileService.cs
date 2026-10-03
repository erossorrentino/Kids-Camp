using System;
using MobileFPS.Core;

namespace MobileFPS.Profile
{
    /// <summary>
    /// Owns the <see cref="PlayerProfileData"/> lifecycle: load (with migration),
    /// dirty tracking, and save scheduling.
    ///
    /// Saving strategy for mobile:
    /// - Mutations only mark the profile dirty. <see cref="Flush"/> (called every
    ///   few seconds by MetaGame) writes in the background, coalescing a burst of
    ///   changes (a post-match payout touches five systems) into one write.
    /// - <see cref="SaveNow"/> writes synchronously. Use it on app pause (Android
    ///   can kill a backgrounded app without another callback) and right after an
    ///   IAP grant, before the purchase is acknowledged to the store.
    /// </summary>
    public sealed class ProfileService
    {
        public const string SaveKey = "profile";

        private readonly ISaveStore _store;
        private bool _dirty;

        public PlayerProfileData Data { get; private set; }
        public bool IsDirty => _dirty;

        public event Action Saved;

        public ProfileService(ISaveStore store)
        {
            _store = store;
        }

        /// <summary>Loads the saved profile or creates a new one. Always leaves <see cref="Data"/> valid.</summary>
        public void Load(DateTime utcNow)
        {
            PlayerProfileData data = null;
            if (_store != null && _store.TryLoad(SaveKey, out PlayerProfileData loaded)) data = loaded;

            if (data == null)
            {
                data = CreateNew(utcNow);
                _dirty = true;
            }

            Migrate(data);
            Repair(data);
            data.sessionCount++;
            Data = data;
            MarkDirty();
        }

        /// <summary>Uses an in-memory profile (tests, guest mode, QA presets).</summary>
        public void UseData(PlayerProfileData data)
        {
            Repair(data);
            Data = data;
        }

        public void MarkDirty() => _dirty = true;

        public void Flush()
        {
            if (!_dirty || _store == null || Data == null) return;
            _dirty = false;
            _store.SaveAsync(SaveKey, Data);
            Saved?.Invoke();
        }

        public void SaveNow()
        {
            if (_store == null || Data == null) return;
            _dirty = false;
            _store.SaveImmediate(SaveKey, Data);
            Saved?.Invoke();
        }

        /// <summary>Wipes local progress (account deletion; required by Google Play policy for apps with accounts).</summary>
        public void DeleteLocalData(DateTime utcNow)
        {
            _store?.Delete(SaveKey);
            Data = CreateNew(utcNow);
            _dirty = true;
        }

        public static PlayerProfileData CreateNew(DateTime utcNow)
        {
            return new PlayerProfileData
            {
                playerId = Guid.NewGuid().ToString("N"),
                createdUtcTicks = utcNow.Ticks,
                lastSeenUtcTicks = utcNow.Ticks,
                wallet = new WalletData { credits = 500 }, // a little starting soft currency to teach the shop
            };
        }

        private static void Migrate(PlayerProfileData data)
        {
            // Schema migrations run in order; each step upgrades by one version.
            // Example for the future:
            // if (data.schemaVersion < 2) { /* split/rename fields */ data.schemaVersion = 2; }
            if (data.schemaVersion > PlayerProfileData.CurrentSchemaVersion)
            {
                UnityEngine.Debug.LogWarning("[Profile] Save is from a newer app version; loading what we understand.");
            }
            data.schemaVersion = Math.Max(data.schemaVersion, PlayerProfileData.CurrentSchemaVersion);
        }

        /// <summary>Defensive: a corrupted or hand-edited save must never null-ref the meta layer.</summary>
        private static void Repair(PlayerProfileData data)
        {
            if (string.IsNullOrEmpty(data.playerId)) data.playerId = Guid.NewGuid().ToString("N");
            data.wallet ??= new WalletData();
            data.progression ??= new ProgressionData();
            data.progression.weapons ??= new System.Collections.Generic.List<WeaponProgressData>();
            data.progression.rewardedMatchIds ??= new System.Collections.Generic.List<string>();
            if (data.progression.accountLevel < 1) data.progression.accountLevel = 1;
            data.inventory ??= new InventoryData();
            data.inventory.ownedItems ??= new System.Collections.Generic.List<string>();
            data.inventory.equippedSkins ??= new System.Collections.Generic.List<EquippedSkinData>();
            data.battlePass ??= new BattlePassData();
            data.battlePass.claimedFree ??= new System.Collections.Generic.List<int>();
            data.battlePass.claimedPremium ??= new System.Collections.Generic.List<int>();
            data.dailyReward ??= new DailyRewardData();
            data.challenges ??= new DailyChallengeData();
            data.challenges.active ??= new System.Collections.Generic.List<ChallengeStateData>();
            data.monetization ??= new MonetizationData();
            data.monetization.processedTransactions ??= new System.Collections.Generic.List<string>();
            data.monetization.productPurchaseCounts ??= new System.Collections.Generic.List<CountEntry>();
            data.monetization.shopPurchaseCounts ??= new System.Collections.Generic.List<CountEntry>();
            data.monetization.adPlacements ??= new System.Collections.Generic.List<AdPlacementData>();
            data.monetization.doubledMatchIds ??= new System.Collections.Generic.List<string>();
            data.loadout ??= new System.Collections.Generic.List<SavedLoadoutSlot>();
            if (data.wallet.credits < 0) data.wallet.credits = 0;
            if (data.wallet.gems < 0) data.wallet.gems = 0;
        }
    }
}
