using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>
    /// Learnable recoil: a fixed per-shot kick sequence plus a small random
    /// component. Fixed patterns reward practice (the skill ceiling that keeps
    /// competitive players engaged); the random part stops it being a pure macro.
    /// Patterns are shared assets, so one "AR climb" can serve several rifles with
    /// different <see cref="RecoilSettings.scale"/>.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Weapons/Recoil Pattern", fileName = "RecoilPattern")]
    public sealed class RecoilPattern : ScriptableObject
    {
        [Tooltip("Kick per shot in degrees. x = horizontal (right +), y = vertical (up +). Element 0 is the first shot.")]
        public Vector2[] kicks =
        {
            new Vector2(0f, 1.0f), new Vector2(0.1f, 1.1f), new Vector2(-0.1f, 1.2f), new Vector2(0.2f, 1.2f),
            new Vector2(0.3f, 1.1f), new Vector2(0.2f, 1.0f), new Vector2(-0.2f, 0.9f), new Vector2(-0.4f, 0.8f),
        };

        [Tooltip("Uniform random ± added per axis per shot.")]
        public Vector2 randomness = new Vector2(0.15f, 0.08f);

        [Tooltip("First shot is gentler: rewards tap-firing at range.")]
        [Range(0f, 1.5f)] public float firstShotMultiplier = 0.6f;

        [Tooltip("After the last entry, repeat from this index (-1 = keep repeating the last kick).")]
        public int loopFromIndex = -1;

        /// <summary>Kick for the <paramref name="shotIndex"/>-th consecutive shot.</summary>
        public Vector2 GetKick(int shotIndex, ref DeterministicRandom random)
        {
            Vector2 kick = SampleSequence(shotIndex);
            kick.x += random.Range(-randomness.x, randomness.x);
            kick.y += random.Range(-randomness.y, randomness.y);
            if (shotIndex == 0) kick *= firstShotMultiplier;
            return kick;
        }

        private Vector2 SampleSequence(int shotIndex)
        {
            if (kicks == null || kicks.Length == 0) return new Vector2(0f, 1f);
            if (shotIndex < kicks.Length) return kicks[shotIndex];

            if (loopFromIndex >= 0 && loopFromIndex < kicks.Length)
            {
                int loopLength = kicks.Length - loopFromIndex;
                return kicks[loopFromIndex + (shotIndex - kicks.Length) % loopLength];
            }
            return kicks[kicks.Length - 1];
        }

        /// <summary>Procedural pattern for tooling/default content: steady climb with a seeded sideways drift.</summary>
        public static Vector2[] GenerateClimb(int shots, float vertical, float horizontalDrift, uint seed)
        {
            var random = new DeterministicRandom(seed);
            var result = new Vector2[shots];
            float drift = 0f;
            for (int i = 0; i < shots; i++)
            {
                drift = Mathf.Clamp(drift + random.Range(-horizontalDrift, horizontalDrift), -horizontalDrift * 2f, horizontalDrift * 2f);
                float climb = vertical * Mathf.Lerp(1.15f, 0.75f, shots > 1 ? i / (float)(shots - 1) : 0f);
                result[i] = new Vector2(drift, climb);
            }
            return result;
        }
    }
}
