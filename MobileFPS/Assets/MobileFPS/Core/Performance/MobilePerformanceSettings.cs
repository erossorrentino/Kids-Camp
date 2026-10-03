using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Device-level performance policy. Put one at
    /// Resources/MobileFPS/MobilePerformanceSettings to override the defaults;
    /// the bootstrap still applies sensible defaults without it.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Core/Mobile Performance Settings", fileName = "MobilePerformanceSettings")]
    public sealed class MobilePerformanceSettings : ScriptableObject
    {
        public const string ResourcesPath = "MobileFPS/MobilePerformanceSettings";

        [Header("Frame rate")]
        [Tooltip("Android defaults to 30 FPS unless targetFrameRate is set. A competitive shooter needs 60.")]
        public int combatFrameRate = 60;

        [Tooltip("Allow 90/120 Hz on capable displays when the player opts in (settings menu). Costs battery and heat.")]
        public bool allowHighRefreshRate = false;

        [Tooltip("Cap used when high refresh is allowed and the display supports it.")]
        public int highRefreshFrameRate = 90;

        [Tooltip("In menus, render every Nth frame while input and logic keep the full rate (OnDemandRendering). 2 halves GPU work in the lobby.")]
        [Range(1, 4)] public int menuRenderInterval = 2;

        [Header("Adaptive resolution (governor)")]
        public bool enableGovernor = true;

        [Tooltip("Render scales per quality tier, best first. The governor steps down on sustained frame drops and up again when there's headroom.")]
        public float[] renderScaleTiers = { 1f, 0.85f, 0.72f, 0.6f };

        [Tooltip("Seconds of sustained over-budget frames before stepping a tier down.")]
        public float downgradeAfterSeconds = 2.5f;

        [Tooltip("Seconds of sustained headroom before stepping a tier back up (longer to avoid oscillation).")]
        public float upgradeAfterSeconds = 12f;

        [Tooltip("Frame time ratio vs budget considered over budget (1.12 = 12% slower than target).")]
        public float overBudgetRatio = 1.12f;

        [Tooltip("Frame time ratio vs budget considered comfortable headroom.")]
        public float headroomRatio = 0.78f;

        [Header("Physics")]
        [Tooltip("Off: transform changes reach physics only at simulation time or on explicit SyncTransforms. Saves a lot when many objects move.")]
        public bool autoSyncTransforms = false;

        [Tooltip("Reuse Collision objects in OnCollision* callbacks (zero GC).")]
        public bool reuseCollisionCallbacks = true;

        [Tooltip("Fixed timestep. 1/50 is plenty: player movement runs in Update via CharacterController, not rigidbodies.")]
        public float fixedTimestep = 0.02f;

        [Tooltip("Caps catch-up physics steps after a hitch (avoids the 'spiral of death' on slow devices).")]
        public float maximumDeltaTime = 0.1f;

        public static MobilePerformanceSettings LoadOrDefault()
        {
            var settings = Resources.Load<MobilePerformanceSettings>(ResourcesPath);
            return settings != null ? settings : CreateInstance<MobilePerformanceSettings>();
        }
    }
}
