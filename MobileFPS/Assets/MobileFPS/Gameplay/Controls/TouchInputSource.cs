using UnityEngine;

namespace MobileFPS.Controls
{
    /// <summary>
    /// Multi-touch FPS controls: a floating move stick on the left, free look on
    /// the right, and on-screen buttons anywhere. Built for the mobile-shooter
    /// layout players already know:
    /// - <b>Zones by first contact.</b> A finger's role (move/look/button) is fixed
    ///   when it lands, so dragging the look thumb across the screen never
    ///   accidentally becomes movement.
    /// - <b>Fire-button steering.</b> A finger on a Fire button with look-drag
    ///   enabled also rotates the camera, so the player can track while shooting
    ///   with one thumb.
    /// - <b>Sprint lock.</b> Pushing the stick forward past its rim engages sprint
    ///   with no extra button.
    /// - <b>Resolution independent.</b> Pixels are converted to inches with the
    ///   display's DPI (corrected for render-scale), so sensitivity is the same on
    ///   every device.
    ///
    /// Performance: allocation-free per frame. Input.GetTouch(i) returns a struct
    /// (the Input.touches property allocates a new array every call: never use it),
    /// finger state is a fixed array, and button hit areas are cached circles.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class TouchInputSource : MonoBehaviour, IPlayerInputSource
    {
        private const int MaxFingers = 10;

        private enum FingerRole : byte { None, Move, Look, Button }

        private struct Finger
        {
            public int Id;              // -1 = free slot
            public FingerRole Role;
            public TouchButton Button;
            public Vector2 LastPosition;
            public bool SeenThisFrame;
        }

        [SerializeField] private TouchControlsSettings settings;
        [SerializeField] private VirtualJoystickView joystickView;

        private readonly Finger[] _fingers = new Finger[MaxFingers];
        private Vector2 _stickOrigin;
        private Vector2 _stick;
        private bool _sprintLocked;
        private bool _aimLatched;
        private Vector2 _previousRawLookDegrees;

        // Edge-triggered button presses collected between polls.
        private bool _firePressed, _jumpPressed, _crouchPressed, _reloadPressed, _switchPressed;

        private float _pixelsPerInch = 320f;
        private int _cachedScreenWidth = -1;
        private int _cachedScreenHeight = -1;

        public bool IsSourceActive => isActiveAndEnabled;
        public bool SprintLocked => _sprintLocked;
        public TouchControlsSettings Settings => settings;

        private void Awake()
        {
            if (settings == null) settings = ScriptableObject.CreateInstance<TouchControlsSettings>();
            for (int i = 0; i < MaxFingers; i++) _fingers[i].Id = -1;
        }

        private void OnDisable() => ReleaseAll();

        // Android can drop touch-ended events when the app loses focus (notification
        // shade, incoming call). Without this a "stuck" finger keeps firing or walking.
        private void OnApplicationFocus(bool hasFocus) { if (!hasFocus) ReleaseAll(); }
        private void OnApplicationPause(bool paused) { if (paused) ReleaseAll(); }

        public void Poll(ref PlayerInputFrame frame, float deltaTime)
        {
            RefreshScreenMetricsIfNeeded();

            Vector2 lookPixels = Vector2.zero;
            bool lookingWhileFiring = false;

            for (int i = 0; i < MaxFingers; i++) _fingers[i].SeenThisFrame = false;

            int touchCount = Input.touchCount;
            for (int t = 0; t < touchCount; t++)
            {
                Touch touch = Input.GetTouch(t);
                int slot = FindSlot(touch.fingerId);

                if (touch.phase == TouchPhase.Began || slot < 0)
                {
                    if (slot >= 0) ReleaseSlot(slot); // id reused without an Ended event
                    slot = AllocateSlot(touch.fingerId, touch.position);
                    if (slot < 0) continue;
                    AssignRole(ref _fingers[slot], touch.position);
                    _fingers[slot].SeenThisFrame = true;
                    continue;
                }

                ref Finger finger = ref _fingers[slot];
                finger.SeenThisFrame = true;

                // Delta from our own last sample, not Touch.deltaPosition: Android
                // reports deltaPosition relative to the last *OS event*, which drops or
                // double-counts movement when touch rate and frame rate don't line up.
                Vector2 delta = touch.position - finger.LastPosition;
                finger.LastPosition = touch.position;

                switch (finger.Role)
                {
                    case FingerRole.Move:
                        UpdateStick(touch.position);
                        break;
                    case FingerRole.Look:
                        lookPixels += delta;
                        break;
                    case FingerRole.Button:
                        if (finger.Button != null && finger.Button.AllowLookDrag)
                        {
                            lookPixels += delta;
                            if (finger.Button.Action == TouchAction.Fire) lookingWhileFiring = true;
                        }
                        break;
                }

                if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                {
                    ReleaseSlot(slot);
                }
            }

            // Fingers that vanished without an Ended phase.
            for (int i = 0; i < MaxFingers; i++)
            {
                if (_fingers[i].Id >= 0 && !_fingers[i].SeenThisFrame) ReleaseSlot(i);
            }

            bool fireHeld = false, aimHeldByButton = false, sprintHeld = false;
            for (int i = 0; i < MaxFingers; i++)
            {
                if (_fingers[i].Id < 0 || _fingers[i].Role != FingerRole.Button || _fingers[i].Button == null) continue;
                switch (_fingers[i].Button.Action)
                {
                    case TouchAction.Fire: fireHeld = true; break;
                    case TouchAction.Aim: aimHeldByButton = true; break;
                    case TouchAction.Sprint: sprintHeld = true; break;
                }
            }

            bool aimHeld = settings.aimMode == AimButtonMode.Toggle ? _aimLatched : aimHeldByButton;

            var mine = new PlayerInputFrame
            {
                Move = _stick,
                LookDegrees = ConvertLook(lookPixels, deltaTime) + GyroLook(aimHeld, deltaTime),
                FireHeld = fireHeld,
                FirePressed = _firePressed,
                AimHeld = aimHeld,
                JumpPressed = _jumpPressed,
                CrouchPressed = _crouchPressed,
                SprintHeld = sprintHeld || _sprintLocked,
                ReloadPressed = _reloadPressed,
                SwitchWeaponPressed = _switchPressed,
                LookingWhileFiring = lookingWhileFiring,
            };
            frame.Merge(in mine);

            _firePressed = _jumpPressed = _crouchPressed = _reloadPressed = _switchPressed = false;
        }

        public void CancelAimToggle()
        {
            if (!_aimLatched) return;
            _aimLatched = false;
            SetAimButtonsLatched(false);
        }

        public void ReleaseAll()
        {
            for (int i = 0; i < MaxFingers; i++)
            {
                if (_fingers[i].Id >= 0) ReleaseSlot(i);
            }
            _stick = Vector2.zero;
            _sprintLocked = false;
            _previousRawLookDegrees = Vector2.zero;
        }

        /// <summary>Call after the HUD layout changes (customization screen, safe-area update).</summary>
        public void InvalidateLayout()
        {
            var buttons = TouchButton.Active;
            for (int i = 0; i < buttons.Count; i++) buttons[i].InvalidateGeometry();
        }

        private void AssignRole(ref Finger finger, Vector2 position)
        {
            TouchButton button = HitTestButtons(position);
            if (button != null)
            {
                finger.Role = FingerRole.Button;
                finger.Button = button;
                OnButtonDown(button);
                return;
            }

            if (IsInMoveZone(position) && !HasFingerWithRole(FingerRole.Move))
            {
                finger.Role = FingerRole.Move;
                _stickOrigin = settings.floatingStick ? ClampStickOrigin(position) : FixedStickCenter();
                _sprintLocked = false;
                if (joystickView != null) joystickView.Show(_stickOrigin);
                UpdateStick(position);
                return;
            }

            if (!HasFingerWithRole(FingerRole.Look))
            {
                finger.Role = FingerRole.Look;
                return;
            }

            finger.Role = FingerRole.None; // a third thumb/palm: tracked, ignored
        }

        private void ReleaseSlot(int slot)
        {
            ref Finger finger = ref _fingers[slot];
            switch (finger.Role)
            {
                case FingerRole.Move:
                    _stick = Vector2.zero;
                    _sprintLocked = false;
                    if (joystickView != null) joystickView.Hide();
                    break;
                case FingerRole.Button:
                    if (finger.Button != null && !IsButtonHeldByAnotherFinger(finger.Button, slot)) finger.Button.SetPressed(false);
                    break;
            }
            finger.Id = -1;
            finger.Role = FingerRole.None;
            finger.Button = null;
        }

        private void OnButtonDown(TouchButton button)
        {
            button.SetPressed(true);
            switch (button.Action)
            {
                case TouchAction.Fire: _firePressed = true; break;
                case TouchAction.Jump: _jumpPressed = true; break;
                case TouchAction.Crouch: _crouchPressed = true; break;
                case TouchAction.Reload: _reloadPressed = true; break;
                case TouchAction.SwitchWeapon: _switchPressed = true; break;
                case TouchAction.Aim:
                    if (settings.aimMode == AimButtonMode.Toggle)
                    {
                        _aimLatched = !_aimLatched;
                        SetAimButtonsLatched(_aimLatched);
                    }
                    break;
            }
        }

        private void UpdateStick(Vector2 position)
        {
            float radiusPx = Mathf.Max(1f, settings.stickRadiusInches * _pixelsPerInch);
            Vector2 offset = position - _stickOrigin;
            float distance = offset.magnitude;

            if (settings.enableSprintLock)
            {
                float lockDistance = radiusPx + settings.sprintLockExtraInches * _pixelsPerInch;
                bool pushedForward = distance > 0.001f && Vector2.Angle(Vector2.up, offset) <= settings.sprintLockMaxAngle;
                if (distance >= lockDistance && pushedForward) _sprintLocked = true;
                else if (offset.y < radiusPx * 0.5f) _sprintLocked = false; // pulled back: release
            }

            Vector2 clamped = distance > radiusPx ? offset / distance : offset / radiusPx; // magnitude <= 1
            float magnitude = clamped.magnitude;
            float deadzone = settings.stickDeadzone;

            // Rescale so output ramps from 0 at the deadzone edge: no dead jump at small inputs.
            _stick = magnitude <= deadzone ? Vector2.zero : clamped / magnitude * ((magnitude - deadzone) / (1f - deadzone));
            if (_sprintLocked && magnitude > 0.001f) _stick = clamped / magnitude; // full speed while locked

            if (joystickView != null) joystickView.SetKnob(clamped);
        }

        private Vector2 ConvertLook(Vector2 pixels, float deltaTime)
        {
            Vector2 inches = pixels / _pixelsPerInch;
            float multiplier = 1f;
            AnimationCurve curve = settings.lookAcceleration;
            if (curve != null && curve.length > 1 && deltaTime > 0f)
            {
                multiplier = curve.Evaluate(inches.magnitude / deltaTime);
            }

            Vector2 raw = inches * (settings.lookDegreesPerInch * multiplier);
            raw.y *= settings.verticalLookMultiplier * (settings.invertY ? -1f : 1f);

            // Two-tap FIR smoothing: averages with the previous raw sample. Unlike
            // smoothing the *output*, this never adds or loses total rotation; it only
            // spreads it over one extra frame, hiding touch-sampling jitter.
            float s = settings.lookSmoothing;
            Vector2 smoothed = raw * (1f - s) + _previousRawLookDegrees * s;
            _previousRawLookDegrees = raw;
            return smoothed;
        }

        private Vector2 GyroLook(bool aiming, float deltaTime)
        {
            if (settings.gyroMode == GyroMode.Off || !SystemInfo.supportsGyroscope) return Vector2.zero;
            Gyroscope gyro = Input.gyro;
            if (!gyro.enabled) gyro.enabled = true;
            if (settings.gyroMode == GyroMode.AimOnly && !aiming) return Vector2.zero;

            // rotationRateUnbiased is in the device's natural (portrait) frame, rad/s.
            // Held in landscape, device X is roughly the screen's vertical axis (yaw) and
            // device Y the horizontal axis (pitch). Signs vary by orientation and OEM,
            // hence the configurable axis signs.
            Vector3 rate = gyro.rotationRateUnbiased * (Mathf.Rad2Deg * deltaTime * settings.gyroSensitivity);
            float orientationSign = Screen.orientation == ScreenOrientation.LandscapeRight ? -1f : 1f;
            return new Vector2(rate.x * settings.gyroAxisSigns.x, rate.y * settings.gyroAxisSigns.y) * orientationSign;
        }

        private void RefreshScreenMetricsIfNeeded()
        {
            if (Screen.width == _cachedScreenWidth && Screen.height == _cachedScreenHeight) return;
            _cachedScreenWidth = Screen.width;
            _cachedScreenHeight = Screen.height;

            float dpi = Screen.dpi > 1f ? Screen.dpi : settings.fallbackDpi;

            // Screen.dpi describes the physical panel, but touches arrive in render
            // pixels. If the game renders below native resolution (a common mobile
            // trick), scale the DPI down by the same ratio.
            Display display = Display.main;
            int nativeMax = Mathf.Max(display.systemWidth, display.systemHeight);
            int renderMax = Mathf.Max(Screen.width, Screen.height);
            float renderScale = nativeMax > 0 ? Mathf.Clamp((float)renderMax / nativeMax, 0.25f, 1f) : 1f;

            _pixelsPerInch = Mathf.Max(50f, dpi * renderScale);
            InvalidateLayout();
        }

        private TouchButton HitTestButtons(Vector2 position)
        {
            TouchButton best = null;
            float bestDistance = float.MaxValue;
            int bestPriority = int.MinValue;
            var buttons = TouchButton.Active;
            for (int i = 0; i < buttons.Count; i++)
            {
                TouchButton button = buttons[i];
                if (!button.HitTest(position, out float distance01)) continue;
                if (button.Priority > bestPriority || (button.Priority == bestPriority && distance01 < bestDistance))
                {
                    best = button;
                    bestPriority = button.Priority;
                    bestDistance = distance01;
                }
            }
            return best;
        }

        private bool IsInMoveZone(Vector2 position)
        {
            Rect zone = settings.moveZone;
            float x = position.x / Mathf.Max(1, Screen.width);
            float y = position.y / Mathf.Max(1, Screen.height);
            return x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax;
        }

        private Vector2 ClampStickOrigin(Vector2 position)
        {
            // Keep the whole stick on screen when the thumb lands near an edge.
            float radiusPx = settings.stickRadiusInches * _pixelsPerInch;
            position.x = Mathf.Max(position.x, radiusPx);
            position.y = Mathf.Max(position.y, radiusPx);
            return position;
        }

        private Vector2 FixedStickCenter()
        {
            float radiusPx = settings.stickRadiusInches * _pixelsPerInch;
            Rect zone = settings.moveZone;
            return new Vector2(zone.xMin * Screen.width + radiusPx * 1.8f, zone.yMin * Screen.height + radiusPx * 1.8f);
        }

        private int FindSlot(int fingerId)
        {
            for (int i = 0; i < MaxFingers; i++) if (_fingers[i].Id == fingerId) return i;
            return -1;
        }

        private int AllocateSlot(int fingerId, Vector2 position)
        {
            for (int i = 0; i < MaxFingers; i++)
            {
                if (_fingers[i].Id >= 0) continue;
                _fingers[i] = new Finger { Id = fingerId, Role = FingerRole.None, LastPosition = position };
                return i;
            }
            return -1;
        }

        private bool HasFingerWithRole(FingerRole role)
        {
            for (int i = 0; i < MaxFingers; i++) if (_fingers[i].Id >= 0 && _fingers[i].Role == role) return true;
            return false;
        }

        private bool IsButtonHeldByAnotherFinger(TouchButton button, int exceptSlot)
        {
            for (int i = 0; i < MaxFingers; i++)
            {
                if (i == exceptSlot || _fingers[i].Id < 0) continue;
                if (_fingers[i].Role == FingerRole.Button && _fingers[i].Button == button) return true;
            }
            return false;
        }

        private static void SetAimButtonsLatched(bool latched)
        {
            var buttons = TouchButton.Active;
            for (int i = 0; i < buttons.Count; i++)
            {
                if (buttons[i].Action != TouchAction.Aim) continue;
                buttons[i].IsLatched = latched;
                buttons[i].RefreshVisual();
            }
        }
    }
}
