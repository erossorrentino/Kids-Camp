using UnityEngine;
using UnityEngine.Rendering;

namespace MobileFPS.Core
{
    /// <summary>
    /// Applies mobile runtime settings before the first scene loads, and exposes
    /// combat/menu performance modes.
    ///
    /// Each line here fixes a common Android performance trap; the comments say which.
    /// </summary>
    public static class MobilePerformance
    {
        public static MobilePerformanceSettings Settings { get; private set; }
        public static bool InCombatMode { get; private set; }

        // Runtime copy of the player's choice. Never write to the settings asset at
        // runtime: in the Editor that would silently persist into the .asset file.
        private static bool s_highRefreshAllowed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Bootstrap()
        {
            Settings = MobilePerformanceSettings.LoadOrDefault();
            s_highRefreshAllowed = Settings.allowHighRefreshRate;

            // On mobile, vSyncCount is ignored and targetFrameRate is the real pacing
            // control. Android's default of 30 FPS feels terrible in a shooter.
            QualitySettings.vSyncCount = 0;

            // Multi-touch is required for move + look + fire at the same time.
            Input.multiTouchEnabled = true;

            Physics.autoSyncTransforms = Settings.autoSyncTransforms;
            Physics.reuseCollisionCallbacks = Settings.reuseCollisionCallbacks;
            Time.fixedDeltaTime = Settings.fixedTimestep;
            Time.maximumDeltaTime = Settings.maximumDeltaTime;

            // Never let the screen dim mid-match.
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            SetMenuMode(); // boot lands in the lobby; the match calls SetCombatMode
            MainThreadDispatcher.Warmup();

            if (Settings.enableGovernor && Application.isMobilePlatform)
            {
                var go = new GameObject("[PerformanceGovernor]");
                Object.DontDestroyOnLoad(go);
                go.AddComponent<PerformanceGovernor>().Initialize(Settings);
            }
        }

        /// <summary>Full render rate: call when a match starts.</summary>
        public static void SetCombatMode()
        {
            InCombatMode = true;
            Application.targetFrameRate = ResolveCombatFrameRate();
            OnDemandRendering.renderFrameInterval = 1;
        }

        /// <summary>
        /// Lobby/menus: keep full input rate but render every Nth frame. This cuts
        /// GPU load and heat while the player browses the store, so the device is
        /// cooler (and less throttled) when the next match starts.
        /// </summary>
        public static void SetMenuMode()
        {
            InCombatMode = false;
            Application.targetFrameRate = ResolveCombatFrameRate();
            OnDemandRendering.renderFrameInterval = Mathf.Max(1, Settings != null ? Settings.menuRenderInterval : 2);
        }

        /// <summary>Call from the settings menu when the player toggles high refresh rate.</summary>
        public static void SetHighRefreshAllowed(bool allowed)
        {
            s_highRefreshAllowed = allowed;
            Application.targetFrameRate = ResolveCombatFrameRate();
        }

        private static int ResolveCombatFrameRate()
        {
            int baseRate = Settings != null ? Settings.combatFrameRate : 60;
            if (Settings == null || !s_highRefreshAllowed) return baseRate;

#if UNITY_2022_2_OR_NEWER
            int displayHz = Mathf.RoundToInt((float)Screen.currentResolution.refreshRateRatio.value);
#else
            int displayHz = Screen.currentResolution.refreshRate;
#endif
            return displayHz >= Settings.highRefreshFrameRate ? Settings.highRefreshFrameRate : baseRate;
        }
    }
}
