using MobileFPS.Core;
using MobileFPS.Pooling;
using UnityEngine;

namespace MobileFPS.Effects
{
    /// <summary>
    /// Bullet tracers as short streaks travelling from muzzle to impact. Every
    /// active tracer is advanced in one loop over a fixed array (no per-tracer
    /// MonoBehaviour Update, no coroutines), using pooled LineRenderers.
    /// </summary>
    [AutoCreateSingleton]
    public sealed class TracerSystem : Singleton<TracerSystem>
    {
        private struct ActiveTracer
        {
            public LineRenderer Line;
            public PooledObject Pooled;
            public Vector3 Start;
            public Vector3 Direction;
            public float TotalDistance;
            public float HeadDistance;
        }

        [SerializeField] private LineRenderer tracerPrefab;
        [SerializeField] private float speed = 380f;
        [SerializeField] private float streakLength = 6f;
        [SerializeField] private float width = 0.02f;
        [SerializeField] private int maxActive = 48;

        private ActiveTracer[] _active;
        private int _count;
        private GameObject _runtimePrefab;

        public LineRenderer TracerPrefab
        {
            get => tracerPrefab;
            set => tracerPrefab = value;
        }

        protected override void OnSingletonAwake()
        {
            _active = new ActiveTracer[Mathf.Max(1, maxActive)];
        }

        public void Fire(Vector3 from, Vector3 to, Color color)
        {
            if (_count >= _active.Length) return; // budget: drop, never hitch

            Vector3 delta = to - from;
            float distance = delta.magnitude;
            if (distance < 1f) return; // point blank: a tracer would just flash in the camera

            GameObject prefab = ResolvePrefab();
            if (prefab == null) return;
            PoolManager pools = PoolManager.Instance;
            pools.GetOrCreatePool(prefab, 0, _active.Length, PoolActivationMode.ToggleActive, PoolOverflowPolicy.Reject);
            PooledObject pooled = pools.Spawn(prefab, from, Quaternion.identity);
            if (pooled == null) return;

            var line = pooled.GetComponent<LineRenderer>();
            line.positionCount = 2;
            line.startColor = color;
            line.endColor = new Color(color.r, color.g, color.b, 0f);
            line.SetPosition(0, from);
            line.SetPosition(1, from);

            _active[_count++] = new ActiveTracer
            {
                Line = line,
                Pooled = pooled,
                Start = from,
                Direction = delta / distance,
                TotalDistance = distance,
                HeadDistance = 0f,
            };
        }

        private void Update()
        {
            float step = speed * Time.deltaTime;
            for (int i = _count - 1; i >= 0; i--)
            {
                ref ActiveTracer tracer = ref _active[i];
                if (tracer.Line == null)
                {
                    RemoveAt(i);
                    continue;
                }

                tracer.HeadDistance += step;
                float tail = tracer.HeadDistance - streakLength;
                if (tail >= tracer.TotalDistance)
                {
                    tracer.Pooled.Despawn();
                    RemoveAt(i);
                    continue;
                }

                float head = Mathf.Min(tracer.HeadDistance, tracer.TotalDistance);
                // Head first, tail second: the line's endColor fades the tail.
                tracer.Line.SetPosition(0, tracer.Start + tracer.Direction * head);
                tracer.Line.SetPosition(1, tracer.Start + tracer.Direction * Mathf.Max(0f, tail));
            }
        }

        private void RemoveAt(int index)
        {
            _count--;
            _active[index] = _active[_count];
            _active[_count] = default;
        }

        private GameObject ResolvePrefab()
        {
            if (tracerPrefab != null) return tracerPrefab.gameObject;
            if (_runtimePrefab != null) return _runtimePrefab;

            // Fallback so tracers work with zero setup. Sprites/Default is in the
            // "Always Included Shaders" list, so it exists in player builds.
            _runtimePrefab = new GameObject("RuntimeTracer");
            _runtimePrefab.SetActive(false);
            _runtimePrefab.transform.SetParent(transform, false);
            var line = _runtimePrefab.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.widthMultiplier = width;
            line.numCapVertices = 0;
            line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            line.receiveShadows = false;
            Shader shader = Shader.Find("Sprites/Default");
            if (shader != null) line.sharedMaterial = new Material(shader);
            return _runtimePrefab;
        }
    }
}
