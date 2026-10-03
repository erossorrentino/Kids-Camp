using System;
using System.Collections.Generic;

namespace MobileFPS.Profile
{
    // Persistent player state. Plain [Serializable] classes (JsonUtility-friendly:
    // lists instead of dictionaries, no polymorphism, no properties).
    //
    // In production this is a local CACHE of server-authoritative state: the
    // server owns currency, entitlements and progression, and the client syncs
    // it. Every mutation goes through a service (Wallet, ProgressionService...)
    // instead of touching these fields directly, so moving authority to a backend
    // means swapping service implementations, not hunting down field writes.

    [Serializable]
    public sealed class PlayerProfileData
    {
        public const int CurrentSchemaVersion = 1;

        public int schemaVersion = CurrentSchemaVersion;
        public string playerId;
        public long createdUtcTicks;
        public long lastSeenUtcTicks;
        public int sessionCount;

        public WalletData wallet = new WalletData();
        public ProgressionData progression = new ProgressionData();
        public InventoryData inventory = new InventoryData();
        public BattlePassData battlePass = new BattlePassData();
        public DailyRewardData dailyReward = new DailyRewardData();
        public DailyChallengeData challenges = new DailyChallengeData();
        public MonetizationData monetization = new MonetizationData();
        public List<SavedLoadoutSlot> loadout = new List<SavedLoadoutSlot>();
    }

    [Serializable]
    public sealed class WalletData
    {
        public long credits;   // soft currency: earned by playing
        public long gems;      // premium currency: bought (and trickled in via battle pass / dailies)
    }

    [Serializable]
    public sealed class ProgressionData
    {
        public int accountLevel = 1;
        public long xpIntoLevel;
        public long totalXp;
        public long doubleXpExpiresUtcTicks;
        public int firstWinDayIndex = -1;
        public List<WeaponProgressData> weapons = new List<WeaponProgressData>();
        public List<string> rewardedMatchIds = new List<string>();
    }

    [Serializable]
    public sealed class WeaponProgressData
    {
        public string weaponId;
        public int level = 1;
        public long xpIntoLevel;
        public int kills;
    }

    [Serializable]
    public sealed class InventoryData
    {
        public List<string> ownedItems = new List<string>();
        public List<EquippedSkinData> equippedSkins = new List<EquippedSkinData>();
    }

    [Serializable]
    public sealed class EquippedSkinData
    {
        public string weaponId;
        public string skinId;
    }

    [Serializable]
    public sealed class BattlePassData
    {
        public string seasonId;
        public long xp;
        public bool premium;
        public List<int> claimedFree = new List<int>();
        public List<int> claimedPremium = new List<int>();
    }

    [Serializable]
    public sealed class DailyRewardData
    {
        public int lastClaimDay = -1;
        public int lastClaimedCalendarIndex = -1;
        public int nextCalendarIndex;
        public int totalClaims;
        public int lastBoostDay = -1;
    }

    [Serializable]
    public sealed class DailyChallengeData
    {
        public int dayIndex = -1;
        public List<ChallengeStateData> active = new List<ChallengeStateData>();
        public bool allCompleteBonusClaimed;
    }

    [Serializable]
    public sealed class ChallengeStateData
    {
        public string challengeId;
        public int progress;
        public bool claimed;
    }

    [Serializable]
    public sealed class MonetizationData
    {
        public List<string> processedTransactions = new List<string>();
        public List<CountEntry> productPurchaseCounts = new List<CountEntry>();
        public List<CountEntry> shopPurchaseCounts = new List<CountEntry>();
        public List<AdPlacementData> adPlacements = new List<AdPlacementData>();
        public List<string> doubledMatchIds = new List<string>();
        public string pendingMatchId;
        public long pendingMatchCredits;
        public int lifetimePurchases;
        public double lifetimeSpendUsd;
    }

    [Serializable]
    public sealed class CountEntry
    {
        public string id;
        public int count;
    }

    [Serializable]
    public sealed class AdPlacementData
    {
        public string placementId;
        public int dayIndex = -1;
        public int countToday;
        public long lastShownUtcTicks;
    }

    [Serializable]
    public sealed class SavedLoadoutSlot
    {
        public string weaponId;
        public List<string> attachmentIds = new List<string>();
        public string skinId;
    }

    internal static class ProfileListExtensions
    {
        public static int GetCount(this List<CountEntry> list, string id)
        {
            for (int i = 0; i < list.Count; i++) if (list[i].id == id) return list[i].count;
            return 0;
        }

        public static void Increment(this List<CountEntry> list, string id)
        {
            for (int i = 0; i < list.Count; i++)
            {
                if (list[i].id != id) continue;
                list[i].count++;
                return;
            }
            list.Add(new CountEntry { id = id, count = 1 });
        }

        /// <summary>Appends and trims from the front to keep idempotency logs bounded.</summary>
        public static void AddBounded(this List<string> list, string value, int maxCount)
        {
            list.Add(value);
            int overflow = list.Count - maxCount;
            if (overflow > 0) list.RemoveRange(0, overflow);
        }
    }
}
