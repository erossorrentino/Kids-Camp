using System;
using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Short haptic ticks for hit markers, kills and damage, the tactile part of
    /// "snappy" shooter feel on phones.
    ///
    /// Handheld.Vibrate() is a ~400 ms buzz, far too long for per-hit feedback, so
    /// Android goes through the Vibrator service over JNI with
    /// VibrationEffect.createOneShot (API 26+) for millisecond pulses with amplitude.
    /// JNI calls aren't free (~10-50 µs), so pulses are rate-limited and the Java
    /// objects are cached once.
    /// </summary>
    public static class Haptics
    {
        /// <summary>Bind to the player's settings toggle.</summary>
        public static bool Enabled = true;

        private const float MinIntervalSeconds = 0.045f; // a shotgun's 8 pellets must not become 8 buzzes
        private static float s_nextAllowedTime;

#if UNITY_ANDROID && !UNITY_EDITOR
        private static bool s_initialized;
        private static int s_sdkInt;
        private static AndroidJavaObject s_vibrator;
        private static AndroidJavaClass s_vibrationEffect;
#endif

        public static void HitTick() => Pulse(10, 70);
        public static void HeadshotTick() => Pulse(16, 140);
        public static void Kill() => Pulse(28, 200);
        public static void DamageTaken() => Pulse(40, 255);

        public static void Pulse(long milliseconds, int amplitude)
        {
            if (!Enabled) return;
            float now = Time.unscaledTime;
            if (now < s_nextAllowedTime) return;
            s_nextAllowedTime = now + MinIntervalSeconds;

#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                EnsureAndroidInitialized();
                if (s_vibrator == null) return;

                if (s_sdkInt >= 26 && s_vibrationEffect != null)
                {
                    using (AndroidJavaObject effect = s_vibrationEffect.CallStatic<AndroidJavaObject>(
                               "createOneShot", milliseconds, Mathf.Clamp(amplitude, 1, 255)))
                    {
                        s_vibrator.Call("vibrate", effect);
                    }
                }
                else
                {
                    s_vibrator.Call("vibrate", milliseconds);
                }
            }
            catch (Exception e)
            {
                Enabled = false; // never spam exceptions from a feedback feature
                Debug.LogWarning($"[Haptics] Disabled: {e.Message}");
            }
#elif UNITY_IOS && !UNITY_EDITOR
            // iOS: wire UIImpactFeedbackGenerator through a native plugin. Handheld.Vibrate
            // is reserved for the heaviest events because it can't be shortened.
            if (amplitude >= 255) Handheld.Vibrate();
#endif
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        private static void EnsureAndroidInitialized()
        {
            if (s_initialized) return;
            s_initialized = true;

            using (var version = new AndroidJavaClass("android.os.Build$VERSION"))
            {
                s_sdkInt = version.GetStatic<int>("SDK_INT");
            }
            using (var unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
            using (AndroidJavaObject activity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity"))
            {
                s_vibrator = activity.Call<AndroidJavaObject>("getSystemService", "vibrator");
            }
            if (s_sdkInt >= 26) s_vibrationEffect = new AndroidJavaClass("android.os.VibrationEffect");
        }
#endif

#if UNITY_ANDROID
        /// <summary>
        /// Never called at runtime. Referencing Handheld.Vibrate makes Unity's Android
        /// build add the VIBRATE permission the JNI path needs.
        /// </summary>
        [UnityEngine.Scripting.Preserve]
        private static void EnsureVibratePermissionIsAdded()
        {
            if (DateTime.UtcNow.Year < 2000) Handheld.Vibrate();
        }
#endif
    }
}
