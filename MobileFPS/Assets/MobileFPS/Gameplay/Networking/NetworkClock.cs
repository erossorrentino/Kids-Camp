using System;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Networking
{
    /// <summary>
    /// The shared time base for hit registration. Every timestamp in a
    /// <see cref="ShotRequest"/> and in <see cref="HitboxHistory"/> is in server time.
    ///
    /// Offline (and in loopback testing) server time is local time. Online, your
    /// netcode feeds clock-sync samples into <see cref="ApplyClockSample"/> and sets
    /// <see cref="InterpolationDelay"/> to however far behind real time it renders
    /// remote players (snapshot interpolation buffer). The client then stamps each
    /// shot with the exact moment of the world it was looking at, and the server
    /// rewinds to that moment.
    /// </summary>
    public static class NetworkClock
    {
        private static Func<double> s_localTime = () => Time.timeAsDouble;
        private static double s_offset;
        private static bool s_hasSample;

        static NetworkClock()
        {
            StaticReset.Register(() =>
            {
                s_offset = 0;
                s_hasSample = false;
                InterpolationDelay = 0;
            });
        }

        /// <summary>Seconds remote entities are rendered behind the newest snapshot (0 offline).</summary>
        public static double InterpolationDelay { get; set; }

        /// <summary>Estimated current server time.</summary>
        public static double Now => s_localTime() + s_offset;

        /// <summary>Server time of the world state the local player currently sees.</summary>
        public static double ViewTime => Now - InterpolationDelay;

        /// <summary>Replaces the local time source (dedicated server tick clock, tests).</summary>
        public static void SetLocalTimeSource(Func<double> source)
        {
            s_localTime = source ?? (() => Time.timeAsDouble);
        }

        /// <summary>
        /// Feed a clock-sync sample: the server's time when it sent the reply, and the
        /// measured round trip. Offsets are smoothed so one jittery mobile packet
        /// (Wi-Fi to LTE handover, for example) doesn't yank the clock.
        /// </summary>
        public static void ApplyClockSample(double serverTime, double roundTripSeconds)
        {
            double estimatedServerNow = serverTime + roundTripSeconds * 0.5;
            double sampleOffset = estimatedServerNow - s_localTime();
            if (!s_hasSample)
            {
                s_offset = sampleOffset;
                s_hasSample = true;
                return;
            }
            // Large disagreement = real clock change (resync); small = jitter (smooth).
            s_offset = Math.Abs(sampleOffset - s_offset) > 0.25 ? sampleOffset : s_offset + (sampleOffset - s_offset) * 0.1;
        }
    }
}
