using UnityEngine;

namespace MobileFPS.Effects
{
    /// <summary>
    /// Muzzle flash as an always-present child of the weapon: toggled on for a
    /// couple of frames per shot. At 750+ RPM that beats spawning anything per
    /// shot, even from a pool.
    ///
    /// The optional dynamic Light is only enabled when <see cref="AllowDynamicLight"/>
    /// is set (high performance tier). In mobile forward rendering every
    /// additional real-time light can add a pass per lit object it touches.
    /// </summary>
    public sealed class MuzzleFlash : MonoBehaviour
    {
        public static bool AllowDynamicLight = false;

        [SerializeField] private GameObject flashVisual;
        [SerializeField] private Light flashLight;
        [SerializeField] private float duration = 0.045f;
        [SerializeField] private bool randomizeRoll = true;
        [SerializeField] private Vector2 randomScale = new Vector2(0.85f, 1.15f);

        private float _hideAt;
        private Vector3 _baseScale = Vector3.one;

        private void Awake()
        {
            if (flashVisual != null)
            {
                _baseScale = flashVisual.transform.localScale;
                flashVisual.SetActive(false);
            }
            if (flashLight != null) flashLight.enabled = false;
            enabled = false; // Update runs only while a flash is visible
        }

        public void Play()
        {
            if (flashVisual != null)
            {
                Transform t = flashVisual.transform;
                if (randomizeRoll) t.localRotation = Quaternion.Euler(0f, 0f, Random.Range(0f, 360f));
                t.localScale = _baseScale * Random.Range(randomScale.x, randomScale.y);
                flashVisual.SetActive(true);
            }
            if (flashLight != null) flashLight.enabled = AllowDynamicLight;
            _hideAt = Time.time + duration;
            enabled = true;
        }

        private void Update()
        {
            if (Time.time < _hideAt) return;
            if (flashVisual != null) flashVisual.SetActive(false);
            if (flashLight != null) flashLight.enabled = false;
            enabled = false;
        }
    }
}
