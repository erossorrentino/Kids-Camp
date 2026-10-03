using UnityEngine;

namespace MobileFPS.Controls
{
    /// <summary>
    /// Mouse + keyboard source for Editor iteration (and ChromeOS / Google Play
    /// Games on PC, where the same Android build runs with a keyboard). Lets
    /// designers tune movement and gunplay without deploying to a phone each time.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class DesktopInputSource : MonoBehaviour, IPlayerInputSource
    {
        [SerializeField] private float mouseDegreesPerCount = 2.2f;
        [SerializeField] private bool invertY;
        [SerializeField] private bool lockCursorOnClick = true;
        [SerializeField] private bool aimIsToggle;

        private bool _aimLatched;
        private bool _axesAvailable = true;

        public bool IsSourceActive => isActiveAndEnabled;

        public void Poll(ref PlayerInputFrame frame, float deltaTime)
        {
            if (lockCursorOnClick)
            {
                if (Input.GetKeyDown(KeyCode.Escape)) Cursor.lockState = CursorLockMode.None;
                else if (Input.GetMouseButtonDown(0) && Cursor.lockState != CursorLockMode.Locked) Cursor.lockState = CursorLockMode.Locked;
            }

            Vector2 move = Vector2.zero;
            if (Input.GetKey(KeyCode.W)) move.y += 1f;
            if (Input.GetKey(KeyCode.S)) move.y -= 1f;
            if (Input.GetKey(KeyCode.D)) move.x += 1f;
            if (Input.GetKey(KeyCode.A)) move.x -= 1f;
            if (move.sqrMagnitude > 1f) move.Normalize();

            Vector2 look = Vector2.zero;
            bool cursorCaptured = Cursor.lockState == CursorLockMode.Locked || !lockCursorOnClick;
            if (cursorCaptured && _axesAvailable)
            {
                try
                {
                    look = new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * mouseDegreesPerCount;
                    if (invertY) look.y = -look.y;
                }
                catch (System.ArgumentException)
                {
                    _axesAvailable = false; // project's Input Manager lacks the default mouse axes
                    Debug.LogWarning("[DesktopInput] 'Mouse X'/'Mouse Y' axes missing from Input Manager; mouse look disabled.");
                }
            }

            bool aimHeld;
            if (aimIsToggle)
            {
                if (Input.GetMouseButtonDown(1)) _aimLatched = !_aimLatched;
                aimHeld = _aimLatched;
            }
            else
            {
                aimHeld = Input.GetMouseButton(1);
            }

            var mine = new PlayerInputFrame
            {
                Move = move,
                LookDegrees = look,
                FireHeld = cursorCaptured && Input.GetMouseButton(0),
                FirePressed = cursorCaptured && Input.GetMouseButtonDown(0),
                AimHeld = aimHeld,
                JumpPressed = Input.GetKeyDown(KeyCode.Space),
                CrouchPressed = Input.GetKeyDown(KeyCode.C) || Input.GetKeyDown(KeyCode.LeftControl),
                SprintHeld = Input.GetKey(KeyCode.LeftShift),
                ReloadPressed = Input.GetKeyDown(KeyCode.R),
                SwitchWeaponPressed = Input.GetKeyDown(KeyCode.Q) || Input.mouseScrollDelta.y != 0f,
            };
            frame.Merge(in mine);
        }

        public void CancelAimToggle() => _aimLatched = false;

        public void ReleaseAll() => _aimLatched = false;
    }
}
