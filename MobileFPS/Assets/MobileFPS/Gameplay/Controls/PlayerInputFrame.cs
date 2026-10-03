using UnityEngine;

namespace MobileFPS.Controls
{
    /// <summary>
    /// One frame of player intent, sampled once per frame by <see cref="PlayerInputRouter"/>
    /// and consumed by the player. Gameplay never reads Input directly, so:
    /// - touch, gamepad, desktop and bots all drive the same code path;
    /// - the frame can be recorded for replays/kill-cams or sent to a server as a
    ///   prediction command without touching gameplay code.
    /// </summary>
    public struct PlayerInputFrame
    {
        /// <summary>x = strafe, y = forward. Magnitude &lt;= 1, deadzone already applied.</summary>
        public Vector2 Move;

        /// <summary>Look delta in degrees for this frame at hip-fire sensitivity. x = yaw (right +), y = pitch (up +).</summary>
        public Vector2 LookDegrees;

        public bool FireHeld;
        public bool FirePressed;

        /// <summary>Resolved aim-down-sights state (hold or toggle logic already applied by the source).</summary>
        public bool AimHeld;

        public bool JumpPressed;

        /// <summary>Crouch tap. While sprinting this becomes a slide.</summary>
        public bool CrouchPressed;

        /// <summary>Sprint requested (sprint button, stick sprint-lock, or keyboard).</summary>
        public bool SprintHeld;

        public bool ReloadPressed;
        public bool SwitchWeaponPressed;

        /// <summary>True when the look delta is being driven by a finger that is also holding fire (CoD-style "fire button steers").</summary>
        public bool LookingWhileFiring;

        /// <summary>Combines another source into this frame (touch + gamepad + Editor desktop).</summary>
        public void Merge(in PlayerInputFrame other)
        {
            if (other.Move.sqrMagnitude > Move.sqrMagnitude) Move = other.Move;
            LookDegrees += other.LookDegrees;
            FireHeld |= other.FireHeld;
            FirePressed |= other.FirePressed;
            AimHeld |= other.AimHeld;
            JumpPressed |= other.JumpPressed;
            CrouchPressed |= other.CrouchPressed;
            SprintHeld |= other.SprintHeld;
            ReloadPressed |= other.ReloadPressed;
            SwitchWeaponPressed |= other.SwitchWeaponPressed;
            LookingWhileFiring |= other.LookingWhileFiring;
        }
    }

    /// <summary>A device-specific producer of <see cref="PlayerInputFrame"/>s.</summary>
    public interface IPlayerInputSource
    {
        bool IsSourceActive { get; }

        /// <summary>Samples the device and merges this source's intent into <paramref name="frame"/>.</summary>
        void Poll(ref PlayerInputFrame frame, float deltaTime);

        /// <summary>Clears latched states, e.g. tap-to-ADS when a sprint or reload cancels aiming.</summary>
        void CancelAimToggle();

        /// <summary>Drops all fingers/keys (focus loss, pause menu, death).</summary>
        void ReleaseAll();
    }
}
