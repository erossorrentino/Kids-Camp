using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Frame-rate independent interpolation helpers.
    ///
    /// The classic `Lerp(a, b, speed * Time.deltaTime)` converges at different rates
    /// at 30 vs 120 FPS (and overshoots when speed*dt &gt; 1 during a frame spike).
    /// Android devices span 30-144 Hz, so every smoothing in this codebase uses an
    /// exponential decay instead: `1 - exp(-sharpness * dt)` gives the same curve
    /// at any frame rate.
    /// </summary>
    public static class Smoothing
    {
        /// <summary>Blend factor that moves a value toward its target at a frame-rate independent rate.</summary>
        /// <param name="sharpness">Higher is snappier. Roughly: ~63% of the gap is closed after 1/sharpness seconds.</param>
        public static float Factor(float sharpness, float deltaTime)
        {
            return 1f - Mathf.Exp(-sharpness * deltaTime);
        }

        public static float Damp(float current, float target, float sharpness, float deltaTime)
        {
            return Mathf.Lerp(current, target, Factor(sharpness, deltaTime));
        }

        public static Vector2 Damp(Vector2 current, Vector2 target, float sharpness, float deltaTime)
        {
            return Vector2.Lerp(current, target, Factor(sharpness, deltaTime));
        }

        public static Vector3 Damp(Vector3 current, Vector3 target, float sharpness, float deltaTime)
        {
            return Vector3.Lerp(current, target, Factor(sharpness, deltaTime));
        }

        /// <summary>Linear approach that never overshoots: ideal for timers and blend weights (ADS, sprint).</summary>
        public static float Approach(float current, float target, float maxDelta)
        {
            return Mathf.MoveTowards(current, target, maxDelta);
        }
    }

    /// <summary>
    /// Tiny deterministic PRNG (xorshift32). Both client and server can reproduce
    /// the same "random" spread for a shot from a seed in the shot packet, so the
    /// server can verify shotgun pellets and bullet spread instead of trusting
    /// directions the client claims. UnityEngine.Random is global state and not
    /// reproducible across machines, so it must never touch hit registration.
    /// </summary>
    public struct DeterministicRandom
    {
        private uint _state;

        public DeterministicRandom(uint seed)
        {
            // xorshift has a fixed point at 0; remap it to an arbitrary odd constant.
            _state = seed == 0 ? 0x9E3779B9u : seed;
        }

        public uint State => _state;

        public uint NextUInt()
        {
            uint x = _state;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            _state = x;
            return x;
        }

        /// <summary>Uniform float in [0, 1).</summary>
        public float NextFloat01()
        {
            // 24 high-quality bits -> exact float in [0,1)
            return (NextUInt() >> 8) * (1f / 16777216f);
        }

        /// <summary>Uniform float in [min, max).</summary>
        public float Range(float min, float max)
        {
            return min + (max - min) * NextFloat01();
        }

        /// <summary>Uniform int in [minInclusive, maxExclusive).</summary>
        public int Range(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive) return minInclusive;
            return minInclusive + (int)(NextUInt() % (uint)(maxExclusive - minInclusive));
        }

        /// <summary>Mixes several values into a well-distributed seed (e.g. playerId + dayIndex).</summary>
        public static uint HashSeed(uint a, uint b)
        {
            unchecked
            {
                uint h = a * 0x85EBCA6Bu ^ (b + 0x9E3779B9u + (a << 6) + (a >> 2));
                h ^= h >> 16;
                h *= 0x7FEB352Du;
                h ^= h >> 15;
                h *= 0x846CA68Bu;
                h ^= h >> 16;
                return h;
            }
        }

        /// <summary>Stable FNV-1a hash of a string (string.GetHashCode is not stable across runtimes/platforms).</summary>
        public static uint HashString(string value)
        {
            unchecked
            {
                uint hash = 2166136261u;
                if (value == null) return hash;
                for (int i = 0; i < value.Length; i++)
                {
                    hash ^= value[i];
                    hash *= 16777619u;
                }
                return hash;
            }
        }
    }
}
