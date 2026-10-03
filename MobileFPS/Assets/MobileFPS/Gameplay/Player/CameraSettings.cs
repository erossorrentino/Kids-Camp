using UnityEngine;

namespace MobileFPS.Player
{
    [CreateAssetMenu(menuName = "MobileFPS/Player/Camera Settings", fileName = "CameraSettings")]
    public sealed class CameraSettings : ScriptableObject
    {
        [Header("Field of view (vertical, degrees, at 16:9)")]
        [Tooltip("Mobile screens sit close to the face but are small; ~60-70 vertical reads well. Expose a slider to players.")]
        [Range(50f, 90f)] public float baseFov = 64f;
        public float sprintFovBoost = 6f;
        public float slideFovBoost = 9f;
        public float fovSharpness = 10f;

        [Tooltip("Keep horizontal FOV from shrinking on narrow screens (4:3 tablets): they get the same horizontal view as 16:9.")]
        public bool preserveHorizontalFovOnNarrowScreens = true;

        [Header("Look")]
        public float minPitch = -85f;
        public float maxPitch = 85f;
        [Tooltip("Look sensitivity multiplier at full ADS (player setting). Weapons can scale it further for high-zoom scopes.")]
        [Range(0.2f, 1.5f)] public float adsSensitivityMultiplier = 0.75f;

        [Header("Recoil (aim-affecting)")]
        [Tooltip("How fast the view catches up to recoil kicks. High = crisp kick.")]
        public float recoilSnappiness = 28f;
        [Tooltip("How fast the recoverable part of recoil returns to the original aim.")]
        public float recoilRecoverySharpness = 8f;
        [Tooltip("Recovery waits this long after the last shot, so sustained fire climbs and releases settle.")]
        public float recoilRecoveryDelay = 0.08f;

        [Header("Camera punch (cosmetic, doesn't move bullets)")]
        public float punchFrequency = 32f;
        [Range(0f, 1.5f)] public float punchDamping = 0.5f;

        [Header("Landing / height")]
        public float landingDipPerSpeed = 0.012f;
        public float maxLandingDip = 0.22f;
        public float landingSpringFrequency = 16f;
        [Range(0f, 1.5f)] public float landingSpringDamping = 0.55f;

        [Header("Head bob (subtle: big bob causes motion sickness on handhelds)")]
        public float bobAmplitude = 0.018f;
        public float bobStrideLength = 2.2f;

        [Header("Tilt")]
        public float slideRollDegrees = 5f;
        public float strafeRollDegrees = 1.2f;
        public float rollSharpness = 8f;

        [Header("Shake (trauma model: shake = trauma²)")]
        public Vector3 maxShakeDegrees = new Vector3(2.5f, 2.5f, 3f);
        public float shakeFrequency = 22f;
        public float traumaDecayPerSecond = 1.5f;
    }
}
