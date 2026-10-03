using MobileFPS.Combat;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>Per-shot recoil output, applied by the owner to its camera and viewmodel.</summary>
    public struct RecoilKick
    {
        /// <summary>Aim-affecting kick in degrees (x right+, y up+).</summary>
        public Vector2 AimKickDegrees;
        public float PermanentFraction;

        // Cosmetic.
        public float ViewKickBack;
        public float ViewKickUpDegrees;
        public float ViewKickSideDegrees;
        public Vector3 CameraPunch;
        public float Trauma;
    }

    /// <summary>
    /// Whoever holds the gun: the local player, a bot, or a server-side proxy.
    /// Weapons talk only to this interface, so bots reuse the exact same weapon
    /// code (and are therefore balanced identically).
    /// </summary>
    public interface IWeaponOwner
    {
        CombatEntity Entity { get; }

        /// <summary>Bullets originate at this transform's position along its forward.</summary>
        Transform AimTransform { get; }

        void ApplyRecoil(in RecoilKick kick);
    }

    /// <summary>The slice of input a weapon needs (bots fill this directly).</summary>
    public struct WeaponInput
    {
        public bool FireHeld;
        public bool FirePressed;
        public bool AimHeld;
        public bool ReloadPressed;
        public bool SwitchPressed;
    }

    /// <summary>Per-frame weapon context from the owner's movement state.</summary>
    public struct WeaponTickContext
    {
        public WeaponInput Input;
        public bool IsSprinting;
        public bool IsGrounded;
        public bool IsCrouching;
        public bool IsSliding;
        public float Speed01;
        public float DeltaTime;
    }
}
