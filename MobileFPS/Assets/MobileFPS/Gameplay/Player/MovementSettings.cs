using UnityEngine;

namespace MobileFPS.Player
{
    /// <summary>
    /// Movement tuning. Defaults target the fast, grounded feel of modern mobile
    /// shooters: quick acceleration (no "ice skating"), heavier-than-real gravity
    /// for short snappy jumps, and a momentum slide out of sprint.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Player/Movement Settings", fileName = "MovementSettings")]
    public sealed class MovementSettings : ScriptableObject
    {
        [Header("Speeds (m/s)")]
        public float walkSpeed = 5.0f;
        public float sprintSpeed = 7.4f;
        public float crouchSpeed = 2.6f;
        [Range(0.3f, 1f)] public float backwardMultiplier = 0.8f;
        [Range(0.3f, 1f)] public float strafeMultiplier = 0.92f;

        [Header("Acceleration (m/s²)")]
        [Tooltip("High values = instant response. Mobile sticks are imprecise, so snappy acceleration reads as 'responsive'.")]
        public float groundAcceleration = 55f;
        public float groundDeceleration = 42f;
        public float airAcceleration = 14f;

        [Header("Jump & gravity")]
        [Tooltip("Higher than 9.81: real gravity feels floaty in games.")]
        public float gravity = 24f;
        public float jumpHeight = 1.05f;
        [Tooltip("Grace period after walking off a ledge during which jump still works.")]
        public float coyoteTime = 0.12f;
        [Tooltip("A jump pressed this long before landing still fires on touchdown.")]
        public float jumpBufferTime = 0.12f;
        public float maxFallSpeed = 40f;

        [Header("Sprint")]
        [Tooltip("Minimum forward stick (0-1) to sprint. Sprint is forward-only, like the genre standard.")]
        [Range(0f, 1f)] public float sprintForwardThreshold = 0.55f;

        [Header("Slide (crouch while sprinting)")]
        public float slideMinEntrySpeed = 5.6f;
        [Tooltip("Speed added at slide start.")]
        public float slideBoost = 2.4f;
        [Tooltip("Speed lost per second while sliding on flat ground.")]
        public float slideFriction = 5.5f;
        public float slideMaxDuration = 0.95f;
        public float slideCooldown = 0.6f;
        [Tooltip("Slide ends (into crouch) below this speed.")]
        public float slideEndSpeed = 3.2f;
        [Tooltip("How quickly the stick can bend the slide direction (degrees/second).")]
        public float slideSteerDegreesPerSecond = 110f;
        [Tooltip("Acceleration from slopes while sliding: downhill slides keep going.")]
        public float slideSlopeAcceleration = 14f;

        [Header("Capsule & camera height (m)")]
        public float standingHeight = 1.8f;
        public float crouchHeight = 1.15f;
        public float slideHeight = 0.95f;
        public float heightSharpness = 14f;
        public float eyeOffsetFromTop = 0.12f;

        [Header("Ground detection")]
        public float groundProbeDistance = 0.12f;
        [Tooltip("Keeps the player glued to ramps/stairs going down instead of launching off them.")]
        public float groundSnapDistance = 0.35f;

        [Header("Feedback")]
        public float walkStrideLength = 2.0f;
        public float sprintStrideLength = 2.7f;
        public float crouchStrideLength = 1.4f;
        [Tooltip("Landing faster than this (m/s) counts as a hard landing (bigger camera dip, sound).")]
        public float hardLandingSpeed = 9f;
    }
}
