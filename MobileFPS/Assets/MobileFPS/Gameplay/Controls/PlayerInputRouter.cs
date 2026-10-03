using UnityEngine;

namespace MobileFPS.Controls
{
    /// <summary>
    /// Samples every active <see cref="IPlayerInputSource"/> exactly once per
    /// frame and exposes the merged <see cref="PlayerInputFrame"/>. Sampling in
    /// one place means every consumer (motor, weapon, camera) sees the same
    /// intent in a frame, with no "fire read before look" ordering bugs.
    /// </summary>
    [DefaultExecutionOrder(-150)]
    public sealed class PlayerInputRouter : MonoBehaviour
    {
        [Tooltip("Components implementing IPlayerInputSource (touch, desktop, gamepad...).")]
        [SerializeField] private MonoBehaviour[] sources = new MonoBehaviour[0];

        [Tooltip("In player builds on phones, desktop input is disabled automatically (saves the polling).")]
        [SerializeField] private bool disableDesktopOnHandheld = true;

        private IPlayerInputSource[] _sources = new IPlayerInputSource[0];
        private PlayerInputFrame _current;
        private int _sampledFrame = -1;
        private bool _blocked;

        /// <summary>Input for this frame. Sampled lazily on first access each frame.</summary>
        public PlayerInputFrame Current
        {
            get
            {
                if (_sampledFrame != Time.frameCount) Sample();
                return _current;
            }
        }

        /// <summary>Blocks gameplay input (pause menu, death cam, ad playing).</summary>
        public bool Blocked
        {
            get => _blocked;
            set
            {
                if (_blocked == value) return;
                _blocked = value;
                if (_blocked) ReleaseAll();
            }
        }

        private void Awake()
        {
            int count = 0;
            var resolved = new IPlayerInputSource[sources.Length];
            for (int i = 0; i < sources.Length; i++)
            {
                if (sources[i] is IPlayerInputSource source)
                {
                    if (disableDesktopOnHandheld && !Application.isEditor && Application.isMobilePlatform && source is DesktopInputSource)
                    {
                        sources[i].enabled = false;
                        continue;
                    }
                    resolved[count++] = source;
                }
                else if (sources[i] != null)
                {
                    Debug.LogWarning($"[Input] {sources[i].GetType().Name} does not implement IPlayerInputSource.", this);
                }
            }
            System.Array.Resize(ref resolved, count);
            _sources = resolved;
        }

        public void CancelAimToggle()
        {
            for (int i = 0; i < _sources.Length; i++) _sources[i].CancelAimToggle();
        }

        public void ReleaseAll()
        {
            for (int i = 0; i < _sources.Length; i++) _sources[i].ReleaseAll();
            _current = default;
        }

        private void Sample()
        {
            _sampledFrame = Time.frameCount;
            _current = default;
            float dt = Time.unscaledDeltaTime;
            for (int i = 0; i < _sources.Length; i++)
            {
                IPlayerInputSource source = _sources[i];
                if (source.IsSourceActive) source.Poll(ref _current, dt);
            }
            if (_blocked) _current = default; // still polled above so edge states don't leak after unblocking
        }
    }
}
