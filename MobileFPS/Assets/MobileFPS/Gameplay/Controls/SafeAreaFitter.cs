using UnityEngine;

namespace MobileFPS.Controls
{
    /// <summary>
    /// Fits a RectTransform to Screen.safeArea so HUD buttons never sit under a
    /// notch, punch-hole camera, or rounded corner. Updates only when the safe
    /// area or orientation actually changes, so it costs nothing per frame
    /// otherwise.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    [ExecuteAlways]
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        [SerializeField] private TouchInputSource touchInput;

        private RectTransform _rect;
        private Rect _appliedSafeArea;
        private Vector2Int _appliedScreen;

        private void OnEnable()
        {
            _rect = (RectTransform)transform;
            Apply();
        }

        private void Update()
        {
            if (Screen.safeArea != _appliedSafeArea || Screen.width != _appliedScreen.x || Screen.height != _appliedScreen.y)
            {
                Apply();
            }
        }

        private void Apply()
        {
            Rect safe = Screen.safeArea;
            _appliedSafeArea = safe;
            _appliedScreen = new Vector2Int(Screen.width, Screen.height);
            if (Screen.width <= 0 || Screen.height <= 0) return;

            Vector2 anchorMin = safe.position;
            Vector2 anchorMax = safe.position + safe.size;
            anchorMin.x /= Screen.width;
            anchorMin.y /= Screen.height;
            anchorMax.x /= Screen.width;
            anchorMax.y /= Screen.height;

            _rect.anchorMin = anchorMin;
            _rect.anchorMax = anchorMax;
            _rect.offsetMin = Vector2.zero;
            _rect.offsetMax = Vector2.zero;

            if (touchInput != null) touchInput.InvalidateLayout(); // button hit circles moved
        }
    }
}
