using System;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Economy;
using MobileFPS.Meta;
using MobileFPS.Profile;

namespace MobileFPS.Progression
{
    /// <summary>
    /// Account level, weapon levels, double-XP tokens and the first-win-of-the-day
    /// flag. Level-ups grant their rewards through the <see cref="RewardGranter"/>
    /// and raise events for the level-up celebration UI.
    /// </summary>
    public sealed class ProgressionService
    {
        private readonly ProgressionData _data;
        private readonly ProgressionConfig _config;
        private readonly ITimeProvider _time;
        private readonly Action _markDirty;

        /// <summary>Set after construction (granter and progression reference each other).</summary>
        public RewardGranter Granter { get; set; }

        public ProgressionService(ProgressionData data, ProgressionConfig config, ITimeProvider time, Action markDirty)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _time = time;
            _markDirty = markDirty;
        }

        public int AccountLevel => _data.accountLevel;
        public long XpIntoLevel => _data.xpIntoLevel;
        public long XpForNextLevel => _config.XpToNextAccountLevel(_data.accountLevel);
        public bool IsMaxLevel => _data.accountLevel >= _config.maxAccountLevel;
        public long TotalXp => _data.totalXp;

        public bool IsDoubleXpActive => _time != null && _time.UtcNow.Ticks < _data.doubleXpExpiresUtcTicks;

        public TimeSpan DoubleXpRemaining
        {
            get
            {
                if (!IsDoubleXpActive) return TimeSpan.Zero;
                return new TimeSpan(_data.doubleXpExpiresUtcTicks - _time.UtcNow.Ticks);
            }
        }

        /// <summary>Adds account XP (double XP already applied by the caller when relevant). Returns levels gained.</summary>
        public int AddAccountXp(long amount, string source)
        {
            if (amount <= 0) return 0;
            _data.totalXp += amount;
            int gained = 0;

            if (IsMaxLevel)
            {
                _markDirty?.Invoke();
                return 0;
            }

            _data.xpIntoLevel += amount;
            while (!IsMaxLevel && _data.xpIntoLevel >= XpForNextLevel)
            {
                _data.xpIntoLevel -= XpForNextLevel;
                _data.accountLevel++;
                gained++;
                Telemetry.Log("level_up", "level", _data.accountLevel, "source", source);
                Granter?.Grant(_config.GetLevelReward(_data.accountLevel), $"level_{_data.accountLevel}");
                EventBus<AccountLevelUpEvent>.Raise(new AccountLevelUpEvent { NewLevel = _data.accountLevel });
            }
            if (IsMaxLevel) _data.xpIntoLevel = 0;
            _markDirty?.Invoke();
            return gained;
        }

        public int GetWeaponLevel(string weaponId)
        {
            WeaponProgressData weapon = Find(weaponId);
            return weapon != null ? weapon.level : 1;
        }

        public void AddWeaponXp(string weaponId, long amount)
        {
            if (string.IsNullOrEmpty(weaponId) || amount <= 0) return;
            WeaponProgressData weapon = FindOrCreate(weaponId);
            if (weapon.level >= _config.maxWeaponLevel) return;

            weapon.xpIntoLevel += amount;
            while (weapon.level < _config.maxWeaponLevel && weapon.xpIntoLevel >= _config.XpToNextWeaponLevel(weapon.level))
            {
                weapon.xpIntoLevel -= _config.XpToNextWeaponLevel(weapon.level);
                weapon.level++;
                EventBus<WeaponLevelUpEvent>.Raise(new WeaponLevelUpEvent { WeaponId = weaponId, NewLevel = weapon.level });
            }
            _markDirty?.Invoke();
        }

        public void RecordWeaponKills(string weaponId, int kills)
        {
            if (string.IsNullOrEmpty(weaponId) || kills <= 0) return;
            FindOrCreate(weaponId).kills += kills;
            _markDirty?.Invoke();
        }

        /// <summary>Extends (stacks) double-XP time from whichever is later: now or the current expiry.</summary>
        public void AddDoubleXpMinutes(int minutes)
        {
            if (minutes <= 0 || _time == null) return;
            long start = Math.Max(_time.UtcNow.Ticks, _data.doubleXpExpiresUtcTicks);
            _data.doubleXpExpiresUtcTicks = start + TimeSpan.FromMinutes(minutes).Ticks;
            _markDirty?.Invoke();
        }

        /// <summary>
        /// True the first time a win is recorded on game-day <paramref name="dayIndex"/>.
        /// "First win of the day" bonuses are a cheap, effective daily-return driver.
        /// </summary>
        public bool TryConsumeFirstWinOfDay(int dayIndex)
        {
            if (_data.firstWinDayIndex == dayIndex) return false;
            _data.firstWinDayIndex = dayIndex;
            _markDirty?.Invoke();
            return true;
        }

        private WeaponProgressData Find(string weaponId)
        {
            for (int i = 0; i < _data.weapons.Count; i++)
            {
                if (_data.weapons[i].weaponId == weaponId) return _data.weapons[i];
            }
            return null;
        }

        private WeaponProgressData FindOrCreate(string weaponId)
        {
            WeaponProgressData weapon = Find(weaponId);
            if (weapon != null) return weapon;
            weapon = new WeaponProgressData { weaponId = weaponId };
            _data.weapons.Add(weapon);
            return weapon;
        }
    }
}
