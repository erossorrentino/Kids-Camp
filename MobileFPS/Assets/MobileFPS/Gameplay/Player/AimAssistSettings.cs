using UnityEngine;

namespace MobileFPS.Player
{
    [CreateAssetMenu(menuName = "MobileFPS/Player/Aim Assist Settings", fileName = "AimAssistSettings")]
    public sealed class AimAssistSettings : ScriptableObject
    {
        public bool enabled = true;

        [Header("Target selection")]
        public float maxDistance = 60f;
        [Tooltip("Assist cone radius measured at the target (meters). Converted to an angle per distance, so far targets get a narrower cone.")]
        public float assistRadiusMeters = 0.9f;
        public float minConeDegrees = 1.5f;
        public float maxConeDegrees = 10f;

        [Header("Friction (slowdown over targets)")]
        [Range(0f, 0.9f)] public float hipFriction = 0.3f;
        [Range(0f, 0.9f)] public float adsFriction = 0.5f;

        [Header("Magnetism (gentle rotational pull)")]
        public float hipPullDegreesPerSecond = 4f;
        public float adsPullDegreesPerSecond = 10f;
        [Tooltip("Only pull while the player is moving or looking. Feels like help, not an aimbot, and doesn't drag an idle camera.")]
        public bool requirePlayerInput = true;

        [Header("ADS snap (aim-down-sights near a target eases onto it)")]
        public bool adsSnap = true;
        public float adsSnapConeDegrees = 7f;
        public float adsSnapDuration = 0.12f;
        [Range(0f, 1f)] public float adsSnapStrength = 0.85f;

        [Header("Auto-fire ('simple mode' for casual players)")]
        public bool autoFireEnabled = false;
        [Tooltip("Seconds the crosshair must rest on an enemy before auto-fire starts (prevents instant-reaction advantage).")]
        public float autoFireDelay = 0.08f;

        [Header("Cost control")]
        [Tooltip("Line-of-sight raycasts are throttled to this interval per target (mobile CPU budget).")]
        public float lineOfSightInterval = 0.1f;
        public LayerMask occlusionMask = ~0;
    }
}
