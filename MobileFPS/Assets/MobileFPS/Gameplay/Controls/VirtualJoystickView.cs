using UnityEngine;

namespace MobileFPS.Controls
{
    /// <summary>
    /// Pure visual for the move stick. The input logic lives in
    /// <see cref="TouchInputSource"/>; this only moves two RectTransforms and fades a
    /// CanvasGroup.
    ///
    /// Put the joystick on its own Canvas (or a nested canvas). Moving the knob
    /// every frame dirties its canvas, and nested canvases are rebuilt
    /// independently, so a moving knob won't force a re-batch of the whole HUD.
    /// That is one of the biggest UI costs on mobile.
    /// </summary>
    public sealed class VirtualJoystickView : MonoBehaviour
    {
        [SerializeField] private RectTransform background;
        [SerializeField] private RectTransform knob;
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField, Range(0f, 1f)] private float idleAlpha = 0.35f;
        [SerializeField, Range(0f, 1f)] private float activeAlpha = 0.9f;

        private Canvas _canvas;
        private Vector3 _restLocalPosition;
        private Vector2 _lastKnob = new Vector2(float.NaN, float.NaN);

        private void Awake()
        {
            _canvas = GetComponentInParent<Canvas>();
            if (background != null) _restLocalPosition = background.localPosition;
            Hide();
        }

        public void Show(Vector2 screenPosition)
        {
            if (background == null) return;
            var parent = background.parent as RectTransform;
            if (parent != null && RectTransformUtility.ScreenPointToLocalPointInRectangle(parent, screenPosition, CanvasCamera(), out Vector2 local))
            {
                background.localPosition = local;
            }
            if (canvasGroup != null) canvasGroup.alpha = activeAlpha;
        }

        /// <param name="normalized">Stick vector, magnitude 0..1.</param>
        public void SetKnob(Vector2 normalized)
        {
            if (knob == null || background == null) return;
            // Skip redundant writes: every RectTransform write dirties the canvas.
            if ((normalized - _lastKnob).sqrMagnitude < 1e-6f) return;
            _lastKnob = normalized;
            float radius = background.rect.width * 0.5f;
            knob.anchoredPosition = normalized * radius;
        }

        public void Hide()
        {
            if (background != null) background.localPosition = _restLocalPosition;
            SetKnob(Vector2.zero);
            if (canvasGroup != null) canvasGroup.alpha = idleAlpha;
        }

        private Camera CanvasCamera()
        {
            if (_canvas == null || _canvas.renderMode == RenderMode.ScreenSpaceOverlay) return null;
            return _canvas.worldCamera;
        }
    }
}
