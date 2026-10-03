using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Player
{
    /// <summary>
    /// Physics-feel viewmodel motion: look sway (the gun lags behind fast turns),
    /// strafe tilt, distance-synced bob, jump/land bounce, sprint pose, ADS pose,
    /// and recoil kick. All of it goes through closed-form springs, which stay
    /// stable through mobile frame spikes.
    ///
    /// Pose blends (ADS, sprint) are applied directly from their 0-1 blend values
    /// rather than through the springs, so ADS stays locked to the weapon's
    /// ADS-time stat. Only the secondary motion is springy.
    /// </summary>
    public sealed class WeaponSway : MonoBehaviour
    {
        public struct SwayInput
        {
            public Vector2 LookDegrees;      // this frame's look delta
            public Vector3 LocalVelocity;    // player velocity in player space (x strafe, y vertical, z forward)
            public bool Grounded;
            public bool Landed;
            public float LandingSpeed;
            public float AdsBlend;
            public float SprintBlend;
            public bool Sliding;
            public float MaxSpeed;
        }

        [Header("Look sway")]
        [Tooltip("Degrees of lag per degree/second of camera turn.")]
        [SerializeField] private float lookSwayPerDegreePerSecond = 0.006f;
        [SerializeField] private float maxLookSwayDegrees = 5f;
        [Tooltip("Meters of sideways/vertical drift per degree of lag.")]
        [SerializeField] private float lookSwayMetersPerDegree = 0.004f;

        [Header("Movement")]
        [SerializeField] private float strafeTiltDegrees = 4f;
        [SerializeField] private Vector2 walkBobAmplitude = new Vector2(0.012f, 0.008f);
        [SerializeField] private Vector2 sprintBobAmplitude = new Vector2(0.03f, 0.018f);
        [SerializeField] private float bobStrideLength = 2.2f;
        [SerializeField] private float verticalVelocityOffset = 0.004f;
        [SerializeField] private float landingKick = 0.006f;

        [Header("Poses (local to the holder)")]
        [SerializeField] private Vector3 sprintPositionOffset = new Vector3(0.04f, -0.05f, -0.03f);
        [SerializeField] private Vector3 sprintRotationOffset = new Vector3(8f, -28f, 12f);
        [SerializeField] private Vector3 slidePositionOffset = new Vector3(-0.03f, -0.02f, 0f);
        [SerializeField] private Vector3 slideRotationOffset = new Vector3(0f, 0f, -14f);

        [Tooltip("Sway kept while fully aimed (sights must stay readable).")]
        [SerializeField, Range(0f, 1f)] private float adsSwayMultiplier = 0.12f;

        [Header("Springs")]
        [SerializeField] private float positionFrequency = 18f;
        [SerializeField, Range(0f, 1.5f)] private float positionDamping = 0.6f;
        [SerializeField] private float rotationFrequency = 20f;
        [SerializeField, Range(0f, 1.5f)] private float rotationDamping = 0.55f;

        [Header("Recoil kick")]
        [SerializeField] private float kickFrequency = 34f;
        [SerializeField, Range(0f, 1.5f)] private float kickDamping = 0.45f;

        private Vector3 _basePosition;
        private Quaternion _baseRotation;
        private SpringVector3 _position;
        private SpringVector3 _rotation;
        private SpringVector3 _kickPosition;
        private SpringVector3 _kickRotation;
        private float _bobDistance;

        /// <summary>Local offset that puts the current weapon's sights on the camera axis (set at equip).</summary>
        public Vector3 AdsPositionOffset { get; set; }

        /// <summary>
        /// Computes <see cref="AdsPositionOffset"/> so that <paramref name="sightAnchor"/>
        /// lands on the camera's center line at full ADS: automatic sight alignment
        /// for any viewmodel, with no hand-tuned per-gun offsets.
        /// </summary>
        public void AlignSights(Transform sightAnchor, float sightDistance)
        {
            if (sightAnchor == null)
            {
                AdsPositionOffset = Vector3.zero;
                return;
            }
            // Sight position in this holder's local space is pose-independent; map it
            // through the holder's rest pose into the parent (camera) space.
            Vector3 sightInHolder = transform.InverseTransformPoint(sightAnchor.position);
            Vector3 restScale = transform.localScale;
            Vector3 sightInCamera = _basePosition + _baseRotation * Vector3.Scale(sightInHolder, restScale);
            AdsPositionOffset = new Vector3(-sightInCamera.x, -sightInCamera.y, sightDistance - sightInCamera.z);
        }

        private void Awake()
        {
            _basePosition = transform.localPosition;
            _baseRotation = transform.localRotation;
        }

        /// <summary>Recoil kick on the viewmodel (cosmetic).</summary>
        /// <param name="backMeters">Kick toward the camera.</param>
        /// <param name="upDegrees">Muzzle climb.</param>
        /// <param name="sideDegrees">Random yaw/roll wobble.</param>
        public void AddRecoilKick(float backMeters, float upDegrees, float sideDegrees)
        {
            // Impulses are velocities; scaling by frequency makes the peak displacement
            // roughly equal to the requested amount for these spring settings.
            _kickPosition.AddImpulse(new Vector3(0f, 0f, -backMeters * kickFrequency));
            _kickRotation.AddImpulse(new Vector3(-upDegrees, sideDegrees, sideDegrees * 0.6f) * kickFrequency);
        }

        public void ResetSway()
        {
            _position.Reset(Vector3.zero);
            _rotation.Reset(Vector3.zero);
            _kickPosition.Reset(Vector3.zero);
            _kickRotation.Reset(Vector3.zero);
        }

        public void Tick(in SwayInput input, float deltaTime)
        {
            if (deltaTime <= 0f) return;
            float swayScale = Mathf.Lerp(1f, adsSwayMultiplier, input.AdsBlend);

            // Look sway: the gun trails the camera opposite to the turn (look units: x right+, y up+).
            Vector2 lookPerSecond = input.LookDegrees / deltaTime;
            Vector2 lag = Vector2.ClampMagnitude(-lookPerSecond * lookSwayPerDegreePerSecond, maxLookSwayDegrees) * swayScale;

            // Strafe tilt and vertical-velocity offset (gun floats on jumps, dips on falls).
            float maxSpeed = Mathf.Max(0.1f, input.MaxSpeed);
            float strafe01 = Mathf.Clamp(input.LocalVelocity.x / maxSpeed, -1f, 1f);
            float verticalOffset = Mathf.Clamp(-input.LocalVelocity.y * verticalVelocityOffset, -0.04f, 0.04f);

            // Distance-based bob: a figure-8 that matches stride length at any speed.
            Vector3 bob = Vector3.zero;
            if (input.Grounded && !input.Sliding)
            {
                float planarSpeed = new Vector2(input.LocalVelocity.x, input.LocalVelocity.z).magnitude;
                _bobDistance += planarSpeed * deltaTime;
                float phase = _bobDistance / Mathf.Max(0.1f, bobStrideLength) * Mathf.PI * 2f;
                Vector2 amplitude = Vector2.Lerp(walkBobAmplitude, sprintBobAmplitude, input.SprintBlend) * Mathf.Clamp01(planarSpeed / maxSpeed * 1.5f);
                bob = new Vector3(Mathf.Sin(phase) * amplitude.x, -Mathf.Abs(Mathf.Cos(phase)) * amplitude.y, 0f) * swayScale;
            }

            if (input.Landed) _position.AddImpulse(new Vector3(0f, -landingKick * Mathf.Min(input.LandingSpeed, 15f) * positionFrequency, 0f));

            Vector3 targetPosition = bob
                                     + new Vector3(lag.x, lag.y, 0f) * lookSwayMetersPerDegree
                                     + new Vector3(0f, verticalOffset, 0f) * swayScale;
            // Euler: +X pitches down, so "lag up" is -X.
            Vector3 targetRotation = new Vector3(-lag.y, lag.x, -strafe01 * strafeTiltDegrees * swayScale);

            SpringCoefficients posSpring = SpringCoefficients.Compute(positionFrequency, positionDamping, deltaTime);
            SpringCoefficients rotSpring = SpringCoefficients.Compute(rotationFrequency, rotationDamping, deltaTime);
            SpringCoefficients kickSpring = SpringCoefficients.Compute(kickFrequency, kickDamping, deltaTime);
            _position.Step(targetPosition, posSpring);
            _rotation.Step(targetRotation, rotSpring);
            _kickPosition.Step(Vector3.zero, kickSpring);
            _kickRotation.Step(Vector3.zero, kickSpring);

            // Pose layers, applied directly from their blends.
            float ads = Ease(input.AdsBlend);
            float sprint = Ease(input.SprintBlend) * (1f - ads);
            float slide = input.Sliding ? 1f - ads : 0f;

            Vector3 posePosition = AdsPositionOffset * ads + sprintPositionOffset * sprint + slidePositionOffset * slide;
            Vector3 poseRotation = sprintRotationOffset * sprint + slideRotationOffset * slide;

            // ADS damps the kick translation a bit so sights stay usable through recoil.
            Vector3 kickPosition = _kickPosition.Value * Mathf.Lerp(1f, 0.6f, ads);

            transform.localPosition = _basePosition + posePosition + _position.Value + kickPosition;
            transform.localRotation = _baseRotation * Quaternion.Euler(poseRotation + _rotation.Value + _kickRotation.Value);
        }

        private static float Ease(float t)
        {
            t = Mathf.Clamp01(t);
            return t * t * (3f - 2f * t);
        }
    }
}
