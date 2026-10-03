using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace MobileFPS.EditorTools
{
    /// <summary>
    /// Applies Google Play-ready Android player settings in one click. Each line
    /// is a setting teams commonly forget until a store rejection or a bad
    /// performance review.
    /// </summary>
    internal static class MobileBuildSettings
    {
        [MenuItem("MobileFPS/Setup/Apply Recommended Android Settings", priority = 20)]
        private static void Apply()
        {
            var log = new StringBuilder();

            // Google Play requires 64-bit; IL2CPP is required for ARM64 and is faster than Mono.
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            log.AppendLine("IL2CPP + ARM64 (Play 64-bit requirement)");

            // Target the newest installed API level (Play raises the minimum every year).
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            log.AppendLine("Target API: highest installed; min API 24");

            // App Bundle (.aab) is mandatory for new Play apps; enables per-device delivery.
            EditorUserBuildSettings.buildAppBundle = true;
            log.AppendLine("Build App Bundle (.aab)");

            // Landscape only, both directions.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.Android.renderOutsideSafeArea = true; // we fit the HUD to the safe area ourselves
            log.AppendLine("Landscape auto-rotation; full-screen with safe-area-aware HUD");

            // Vulkan first (lower CPU driver overhead), GLES3 fallback for older GPUs.
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan, GraphicsDeviceType.OpenGLES3 });
            log.AppendLine("Graphics APIs: Vulkan, GLES3");

            // Multithreaded rendering moves draw submission off the main thread.
            PlayerSettings.SetMobileMTRendering(BuildTargetGroup.Android, true);
            log.AppendLine("Multithreaded rendering");

            // Incremental GC spreads collection across frames: no 10 ms+ spikes mid-fight.
            PlayerSettings.gcIncremental = true;
            log.AppendLine("Incremental GC");

            // Smaller binaries download and install faster (install conversion matters).
            PlayerSettings.SetManagedStrippingLevel(BuildTargetGroup.Android, ManagedStrippingLevel.Medium);
            PlayerSettings.stripEngineCode = true;
            log.AppendLine("Managed stripping: Medium; strip engine code");

            // ASTC: best quality/size on modern Android GPUs.
            EditorUserBuildSettings.androidBuildSubtarget = MobileTextureSubtarget.ASTC;
            log.AppendLine("Texture compression: ASTC");

            AssetDatabase.SaveAssets();
            Debug.Log("[MobileFPS] Applied Android settings:\n" + log);
            EditorUtility.DisplayDialog("MobileFPS: Android settings applied", log + "\nStill to do by hand: package name, keystore signing, app icons, 'Optimized Frame Pacing' (Resolution and Presentation), and switching the build target to Android.", "OK");
        }
    }
}
