using System;
using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Source of "now" for everything time-gated in the economy: daily rewards,
    /// battle pass seasons, ad caps, double-XP tokens.
    ///
    /// Never read DateTime.UtcNow directly in meta code. Players move the device
    /// clock forward to farm daily rewards; routing time through one interface means
    /// that exploit is closed in one place, by swapping in a server-synced provider.
    /// </summary>
    public interface ITimeProvider
    {
        DateTime UtcNow { get; }

        /// <summary>False when the provider suspects tampering (clock rolled back) or has never synced.</summary>
        bool IsTrusted { get; }
    }

    /// <summary>
    /// Device clock with rollback detection. It keeps a persisted high-water mark of
    /// the latest time it has seen. If the clock ever reads earlier than that (beyond
    /// a tolerance for NTP corrections and timezone/DST confusion), the player
    /// probably rewound the clock to re-claim something, and the provider reports
    /// untrusted until real time catches up.
    ///
    /// Forward jumps can't be detected offline. That is why production builds should
    /// use <see cref="ServerSyncedTimeProvider"/> for anything that grants value.
    /// </summary>
    public sealed class DeviceTimeProvider : ITimeProvider
    {
        private static readonly TimeSpan s_rollbackTolerance = TimeSpan.FromMinutes(10);
        private readonly Func<long> _loadHighWaterTicks;
        private readonly Action<long> _saveHighWaterTicks;
        private long _highWaterTicks;

        /// <param name="loadHighWaterTicks">Reads the persisted high-water mark (UTC ticks), 0 if none.</param>
        /// <param name="saveHighWaterTicks">Persists the high-water mark.</param>
        public DeviceTimeProvider(Func<long> loadHighWaterTicks = null, Action<long> saveHighWaterTicks = null)
        {
            _loadHighWaterTicks = loadHighWaterTicks;
            _saveHighWaterTicks = saveHighWaterTicks;
            _highWaterTicks = _loadHighWaterTicks != null ? _loadHighWaterTicks() : 0L;
        }

        public DateTime UtcNow
        {
            get
            {
                DateTime now = DateTime.UtcNow;
                if (now.Ticks > _highWaterTicks)
                {
                    _highWaterTicks = now.Ticks;
                    _saveHighWaterTicks?.Invoke(_highWaterTicks);
                }
                return now;
            }
        }

        public bool IsTrusted => DateTime.UtcNow.Ticks + s_rollbackTolerance.Ticks >= _highWaterTicks;
    }

    /// <summary>
    /// Server-anchored clock. Feed it the server's UTC time once at login (any
    /// HTTPS response's Date header is enough for a soft launch). After that it
    /// advances on the device's monotonic realtime clock, which the player can't
    /// change without restarting the app, and a restart forces a new sync.
    /// </summary>
    public sealed class ServerSyncedTimeProvider : ITimeProvider
    {
        private readonly Func<double> _monotonicSeconds;
        private DateTime _serverUtcAtSync;
        private double _monotonicAtSync;
        private bool _hasSync;

        /// <param name="monotonicSeconds">Monotonic clock in seconds. Defaults to Time.realtimeSinceStartupAsDouble.</param>
        public ServerSyncedTimeProvider(Func<double> monotonicSeconds = null)
        {
            _monotonicSeconds = monotonicSeconds ?? (() => Time.realtimeSinceStartupAsDouble);
        }

        public bool IsTrusted => _hasSync;

        public DateTime UtcNow
        {
            get
            {
                if (!_hasSync) return DateTime.UtcNow; // usable but untrusted until synced
                double elapsed = _monotonicSeconds() - _monotonicAtSync;
                return _serverUtcAtSync.AddSeconds(elapsed);
            }
        }

        /// <param name="serverUtc">Server time.</param>
        /// <param name="roundTripSeconds">Request RTT; half of it is added to compensate one-way latency.</param>
        public void Sync(DateTime serverUtc, double roundTripSeconds = 0)
        {
            _serverUtcAtSync = DateTime.SpecifyKind(serverUtc, DateTimeKind.Utc).AddSeconds(roundTripSeconds * 0.5);
            _monotonicAtSync = _monotonicSeconds();
            _hasSync = true;
        }
    }

    /// <summary>Fully controllable clock for tests and for QA "time travel" debug menus.</summary>
    public sealed class ManualTimeProvider : ITimeProvider
    {
        public DateTime UtcNow { get; set; }
        public bool IsTrusted { get; set; } = true;

        public ManualTimeProvider(DateTime utcNow)
        {
            UtcNow = utcNow;
        }

        public void Advance(TimeSpan delta) => UtcNow += delta;
    }

    /// <summary>
    /// Converts wall-clock time into "game days" that roll over at a fixed UTC hour,
    /// the way live-service shooters reset dailies at one global time instead of
    /// local midnight (which would let players double-dip by changing timezone).
    /// </summary>
    public static class GameDay
    {
        private static readonly DateTime s_epoch = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        /// <summary>Monotonically increasing day number; changes at <paramref name="resetHourUtc"/>:00 UTC.</summary>
        public static int Index(DateTime utcNow, int resetHourUtc)
        {
            double days = (utcNow - s_epoch).TotalHours - resetHourUtc;
            return (int)Math.Floor(days / 24.0);
        }

        /// <summary>UTC instant at which <paramref name="dayIndex"/> begins.</summary>
        public static DateTime StartOf(int dayIndex, int resetHourUtc)
        {
            return s_epoch.AddHours(dayIndex * 24.0 + resetHourUtc);
        }

        public static TimeSpan UntilNextReset(DateTime utcNow, int resetHourUtc)
        {
            int today = Index(utcNow, resetHourUtc);
            return StartOf(today + 1, resetHourUtc) - utcNow;
        }
    }
}
