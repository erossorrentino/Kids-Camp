using UnityEngine;

namespace MobileFPS.Controls
{
    public enum AimButtonMode
    {
        Toggle,  // tap to ADS, tap again to leave (mobile default; frees a thumb)
        Hold,
    }

    public enum GyroMode
    {
        Off,
        AimOnly,  // gyro steers only while ADS: fine-tune long shots without touching the screen
        Always,
    }

    /// <summary>
    /// Player-tunable touch settings. Every value is in physical units (inches,
    /// degrees per inch), never pixels, so a 5" 720p budget phone and a 7" 1440p
    /// tablet feel the same: the same thumb travel gives the same turn.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Controls/Touch Controls Settings", fileName = "TouchControlsSettings")]
    public sealed class TouchControlsSettings : ScriptableObject
    {
        [Header("Look")]
        [Tooltip("Degrees of camera rotation per inch of finger travel at hip-fire.")]
        public float lookDegreesPerInch = 110f;

        [Tooltip("Separate vertical multiplier: vertical swipes are physically shorter on a landscape phone.")]
        public float verticalLookMultiplier = 0.85f;

        public bool invertY = false;

        [Tooltip("Blend with the previous frame's look delta to hide touch-sampling jitter. 0 = raw (lowest latency).")]
        [Range(0f, 0.6f)] public float lookSmoothing = 0.15f;

        [Tooltip("Optional acceleration: x = finger speed (inches/sec), y = sensitivity multiplier. Empty = linear.")]
        public AnimationCurve lookAcceleration = AnimationCurve.Linear(0f, 1f, 10f, 1f);

        [Header("Move stick")]
        [Tooltip("Normalized screen region where a touch spawns the floating move stick.")]
        public Rect moveZone = new Rect(0f, 0f, 0.42f, 0.78f);

        [Tooltip("Stick radius in inches (thumb travel for full speed).")]
        public float stickRadiusInches = 0.45f;

        [Range(0f, 0.5f)] public float stickDeadzone = 0.12f;

        [Tooltip("Stick spawns where the thumb lands instead of a fixed place. Players rarely look at the stick.")]
        public bool floatingStick = true;

        [Header("Sprint lock (push the stick past its edge, like popular mobile shooters)")]
        public bool enableSprintLock = true;

        [Tooltip("Extra inches past the stick radius, toward forward, to engage sprint.")]
        public float sprintLockExtraInches = 0.25f;

        [Tooltip("Maximum angle from straight-forward that still counts as a sprint push.")]
        [Range(5f, 60f)] public float sprintLockMaxAngle = 30f;

        [Header("Buttons")]
        public AimButtonMode aimMode = AimButtonMode.Toggle;

        [Header("Gyroscope")]
        public GyroMode gyroMode = GyroMode.Off;
        public float gyroSensitivity = 1f;

        [Tooltip("Device axis signs differ per orientation and OEM; flip here if gyro aim is inverted.")]
        public Vector2 gyroAxisSigns = new Vector2(-1f, -1f);

        [Header("Device")]
        [Tooltip("Used when Screen.dpi reports 0 (some Android devices/emulators).")]
        public float fallbackDpi = 320f;
    }
}
