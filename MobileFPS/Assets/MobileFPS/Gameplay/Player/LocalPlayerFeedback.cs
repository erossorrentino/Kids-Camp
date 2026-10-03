using MobileFPS.Core;
using MobileFPS.Networking;
using UnityEngine;

namespace MobileFPS.Player
{
    /// <summary>
    /// Haptics, flinch and audio stingers for the local player, driven entirely by
    /// EventBus events. Gameplay code never calls feedback directly, so adding a
    /// new feedback channel (controller rumble, accessibility flashes) is a new
    /// listener with zero changes to combat code.
    /// </summary>
    public sealed class LocalPlayerFeedback : MonoBehaviour
    {
        [SerializeField] private FPSCameraController cameraController;
        [SerializeField] private AudioSource uiAudio;
        [SerializeField] private AudioClip hitMarkerSound;
        [SerializeField] private AudioClip headshotSound;
        [SerializeField] private AudioClip killSound;
        [Tooltip("Degrees of camera flinch when taking a hit (direction-aware).")]
        [SerializeField] private float flinchDegrees = 2.5f;
        [SerializeField, Range(0f, 1f)] private float damageTrauma = 0.25f;

        private void OnEnable()
        {
            EventBus<HitMarkerEvent>.Subscribe(OnHitMarker);
            EventBus<KillEvent>.Subscribe(OnKill);
            EventBus<LocalPlayerDamagedEvent>.Subscribe(OnDamaged);
        }

        private void OnDisable()
        {
            EventBus<HitMarkerEvent>.Unsubscribe(OnHitMarker);
            EventBus<KillEvent>.Unsubscribe(OnKill);
            EventBus<LocalPlayerDamagedEvent>.Unsubscribe(OnDamaged);
        }

        private void OnHitMarker(in HitMarkerEvent evt)
        {
            // React to whichever marker arrives first: predicted ones online,
            // confirmed ones offline. Reacting to both would double-buzz.
            bool localAuthority = !CombatAuthority.HasInstance || !CombatAuthority.Instance.IsServerSimulated;
            if (evt.Confirmed != localAuthority) return;

            if (evt.IsHeadshot) Haptics.HeadshotTick();
            else Haptics.HitTick();

            if (uiAudio == null) return;
            AudioClip clip = evt.IsHeadshot && headshotSound != null ? headshotSound : hitMarkerSound;
            if (clip != null) uiAudio.PlayOneShot(clip);
        }

        private void OnKill(in KillEvent evt)
        {
            if (!evt.KillerIsLocalPlayer || evt.VictimIsLocalPlayer) return;
            Haptics.Kill();
            if (uiAudio != null && killSound != null) uiAudio.PlayOneShot(killSound);
        }

        private void OnDamaged(in LocalPlayerDamagedEvent evt)
        {
            Haptics.DamageTaken();
            if (cameraController == null) return;

            // Flinch away from the damage source: readable direction cue even without UI.
            Transform view = cameraController.AimTransform;
            Vector3 toSource = evt.SourcePosition - view.position;
            float side = Vector3.Dot(view.right, toSource.normalized);
            cameraController.AddPunch(new Vector3(-flinchDegrees * 0.5f, -side * flinchDegrees, side * flinchDegrees * 0.5f));
            cameraController.AddTrauma(damageTrauma * Mathf.Clamp01(evt.Amount / 40f));
        }
    }
}
