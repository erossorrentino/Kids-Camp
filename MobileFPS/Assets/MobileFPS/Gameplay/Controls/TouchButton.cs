using System.Collections.Generic;
using UnityEngine;

namespace MobileFPS.Controls
{
    public enum TouchAction : byte
    {
        Fire,
        Aim,
        Jump,
        Crouch,
        Reload,
        SwitchWeapon,
        Sprint,
    }

    /// <summary>
    /// An on-screen button driven by <see cref="TouchInputSource"/>, not by the
    /// UGUI EventSystem. Hit-testing is a cached circle test in screen pixels:
    /// - no GraphicRaycaster walk over the whole canvas on every touch event;
    /// - one finger can hold Fire and steer the camera at once ("fire button
    ///   drag" in mobile shooters), which the EventSystem's one-pointer-one-target
    ///   model can't express;
    /// - circular hit areas with padding are friendlier to thumbs than rectangles.
    ///
    /// Works on any RectTransform (an Image for visuals is optional), so HUD layout
    /// customization only means moving RectTransforms and saving anchoredPositions.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    [DisallowMultipleComponent]
    public sealed class TouchButton : MonoBehaviour
    {
        private static readonly List<TouchButton> s_active = new List<TouchButton>(16);
        private static readonly Vector3[] s_corners = new Vector3[4];

        [SerializeField] private TouchAction action = TouchAction.Fire;

        [Tooltip("Dragging a finger that started on this button also rotates the camera. Turn on for Fire buttons.")]
        [SerializeField] private bool allowLookDrag;

        [Tooltip("Hit radius relative to the visual's half-size. >1 forgives imprecise thumbs.")]
        [SerializeField, Range(0.8f, 2f)] private float hitRadiusScale = 1.2f;

        [Tooltip("When hit areas overlap, the higher priority wins.")]
        [SerializeField] private int priority;

        [Tooltip("Visual scale while pressed (0.9 = 'pushed in').")]
        [SerializeField, Range(0.7f, 1.1f)] private float pressedScale = 0.9f;

        [Tooltip("Optional: dims the button when idle. No UGUI dependency, any CanvasGroup works.")]
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField, Range(0f, 1f)] private float idleAlpha = 0.65f;
        [SerializeField, Range(0f, 1f)] private float pressedAlpha = 1f;

        private RectTransform _rect;
        private Canvas _canvas;
        private Vector2 _screenCenter;
        private float _screenRadius;
        private Vector3 _baseScale = Vector3.one;
        private bool _geometryValid;

        public static IReadOnlyList<TouchButton> Active => s_active;
        public TouchAction Action => action;
        public bool AllowLookDrag => allowLookDrag;
        public int Priority => priority;
        public bool IsPressed { get; private set; }

        /// <summary>Fire/Aim toggled to "on" (for visual state of toggle buttons). Set by the input source.</summary>
        public bool IsLatched { get; internal set; }

        private void Awake()
        {
            _rect = (RectTransform)transform;
            _baseScale = _rect.localScale;
            _canvas = GetComponentInParent<Canvas>();
            ApplyVisual();
        }

        private void OnEnable()
        {
            if (!s_active.Contains(this)) s_active.Add(this);
            _geometryValid = false; // layout may not be computed yet; refresh lazily
        }

        private void OnDisable()
        {
            s_active.Remove(this);
            IsPressed = false;
            ApplyVisual();
        }

        /// <summary>Recomputes the cached screen-space circle. Call after resolution changes or HUD edits.</summary>
        public void RefreshGeometry()
        {
            if (_rect == null) return;
            Camera cam = null;
            if (_canvas != null && _canvas.renderMode != RenderMode.ScreenSpaceOverlay) cam = _canvas.worldCamera;

            // Undo the pressed-scale so the hit area doesn't shrink while held.
            Vector3 currentScale = _rect.localScale;
            _rect.localScale = _baseScale;
            _rect.GetWorldCorners(s_corners);
            _rect.localScale = currentScale;

            Vector2 min = RectTransformUtility.WorldToScreenPoint(cam, s_corners[0]);
            Vector2 max = RectTransformUtility.WorldToScreenPoint(cam, s_corners[2]);
            _screenCenter = (min + max) * 0.5f;
            Vector2 halfSize = (max - min) * 0.5f;
            _screenRadius = Mathf.Max(Mathf.Abs(halfSize.x), Mathf.Abs(halfSize.y)) * hitRadiusScale;
            _geometryValid = true;
        }

        /// <summary>Returns true when <paramref name="screenPosition"/> is inside the hit circle; distance01 is 0 at center.</summary>
        public bool HitTest(Vector2 screenPosition, out float distance01)
        {
            if (!_geometryValid) RefreshGeometry();
            float distance = Vector2.Distance(screenPosition, _screenCenter);
            distance01 = _screenRadius > 0f ? distance / _screenRadius : float.MaxValue;
            return distance01 <= 1f;
        }

        internal void SetPressed(bool pressed)
        {
            if (IsPressed == pressed) return;
            IsPressed = pressed;
            ApplyVisual();
        }

        internal void InvalidateGeometry() => _geometryValid = false;

        internal void RefreshVisual() => ApplyVisual();

        private void ApplyVisual()
        {
            if (_rect == null) return;
            bool lit = IsPressed || IsLatched;
            _rect.localScale = IsPressed ? _baseScale * pressedScale : _baseScale;
            if (canvasGroup != null) canvasGroup.alpha = lit ? pressedAlpha : idleAlpha;
        }
    }
}
