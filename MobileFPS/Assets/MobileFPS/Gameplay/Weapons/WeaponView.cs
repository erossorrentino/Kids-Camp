using System.Collections.Generic;
using MobileFPS.Effects;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>
    /// The first-person viewmodel: muzzle, sight alignment, flash, audio,
    /// animation hooks and skins. Purely presentational; firing logic never
    /// depends on it, so bots and servers run weapons with no view at all.
    ///
    /// Mobile viewmodel tips: keep it under ~5k triangles with one material
    /// (texture atlas), disable shadow casting (it's always on screen and its
    /// shadow is rarely visible), and render it on the Viewmodel layer so world
    /// lights can be culled from it.
    /// </summary>
    public sealed class WeaponView : MonoBehaviour
    {
        private static readonly int FireHash = Animator.StringToHash("Fire");
        private static readonly int ReloadHash = Animator.StringToHash("Reload");
        private static readonly int ReloadEmptyHash = Animator.StringToHash("ReloadEmpty");
        private static readonly int EquipHash = Animator.StringToHash("Equip");
        private static readonly int AimHash = Animator.StringToHash("Aim");

        [SerializeField] private Transform muzzle;
        [Tooltip("Point on the sights that should sit on the screen center at full ADS.")]
        [SerializeField] private Transform sightAnchor;
        [Tooltip("How far in front of the camera the sight sits at full ADS.")]
        [SerializeField] private float adsSightDistance = 0.18f;
        [SerializeField] private MuzzleFlash muzzleFlash;
        [SerializeField] private AudioSource audioSource;
        [SerializeField] private Animator animator;
        [Tooltip("Renderers whose materials a skin replaces.")]
        [SerializeField] private Renderer[] skinnableRenderers = new Renderer[0];

        private Material[][] _defaultMaterials;
        private bool _hasAnimator;

        // Parameters the controller actually defines. Setting a missing parameter logs a
        // warning every call, and log spam is a real CPU cost on device.
        private readonly HashSet<int> _animatorParameters = new HashSet<int>();

        public Transform Muzzle => muzzle != null ? muzzle : transform;
        public Transform SightAnchor => sightAnchor;
        public float AdsSightDistance => adsSightDistance;
        public Color TracerColor { get; private set; } = new Color(1f, 0.85f, 0.45f, 1f);

        private void Awake()
        {
            _hasAnimator = animator != null && animator.runtimeAnimatorController != null;
            if (_hasAnimator)
            {
                foreach (AnimatorControllerParameter parameter in animator.parameters) _animatorParameters.Add(parameter.nameHash);
            }
            _defaultMaterials = new Material[skinnableRenderers.Length][];
            for (int i = 0; i < skinnableRenderers.Length; i++)
            {
                if (skinnableRenderers[i] != null) _defaultMaterials[i] = skinnableRenderers[i].sharedMaterials;
            }
        }

        public void PlayFire(AudioClip clip, float volume)
        {
            if (muzzleFlash != null) muzzleFlash.Play();
            // PlayOneShot reuses this source's voice. Set the source's priority so
            // gunfire wins over ambience when the mixer runs out of voices on
            // low-end devices.
            if (audioSource != null && clip != null) audioSource.PlayOneShot(clip, volume);
            Trigger(FireHash);
        }

        public void PlayDryFire(AudioClip clip)
        {
            if (audioSource != null && clip != null) audioSource.PlayOneShot(clip, 0.7f);
        }

        public void PlayReload(bool empty, AudioClip clip)
        {
            if (audioSource != null && clip != null) audioSource.PlayOneShot(clip);
            Trigger(empty && _animatorParameters.Contains(ReloadEmptyHash) ? ReloadEmptyHash : ReloadHash);
        }

        public void PlayEquip()
        {
            Trigger(EquipHash);
        }

        public void SetAim(float blend)
        {
            if (_hasAnimator && _animatorParameters.Contains(AimHash)) animator.SetFloat(AimHash, blend);
        }

        private void Trigger(int hash)
        {
            if (_hasAnimator && _animatorParameters.Contains(hash)) animator.SetTrigger(hash);
        }

        public void ApplySkin(WeaponSkinDefinition skin)
        {
            for (int i = 0; i < skinnableRenderers.Length; i++)
            {
                Renderer target = skinnableRenderers[i];
                if (target == null) continue;

                if (skin == null || skin.materials == null || skin.materials.Length == 0)
                {
                    if (_defaultMaterials != null && _defaultMaterials[i] != null) target.sharedMaterials = _defaultMaterials[i];
                    continue;
                }

                // sharedMaterials: never instantiate per-renderer material copies
                // (`.materials` would, breaking batching and leaking memory).
                Material[] slots = target.sharedMaterials;
                for (int s = 0; s < slots.Length; s++) slots[s] = skin.materials[Mathf.Min(s, skin.materials.Length - 1)];
                target.sharedMaterials = slots;
            }
            TracerColor = skin != null ? skin.tracerColor : new Color(1f, 0.85f, 0.45f, 1f);
        }
    }
}
