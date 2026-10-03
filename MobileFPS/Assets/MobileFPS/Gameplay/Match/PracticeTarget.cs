using MobileFPS.Combat;
using UnityEngine;

namespace MobileFPS.Match
{
    /// <summary>
    /// Firing-range dummy: optionally strafes between two points (to exercise aim
    /// assist, lag compensation and moving-target hit registration), "dies",
    /// hides, and respawns. Real hitboxes and health, so every combat path,
    /// including kill events that feed XP and challenges, works against it.
    /// </summary>
    [RequireComponent(typeof(Health), typeof(HitboxRig))]
    public sealed class PracticeTarget : MonoBehaviour
    {
        [SerializeField] private bool strafe = true;
        [SerializeField] private Vector3 strafeOffset = new Vector3(3f, 0f, 0f);
        [SerializeField] private float strafeSpeed = 3.5f;
        [SerializeField] private float respawnDelay = 2f;

        private Health _health;
        private Renderer[] _renderers;
        private Vector3 _origin;
        private float _phase;
        private float _respawnAt = -1f;

        private void Awake()
        {
            _health = GetComponent<Health>();
            _renderers = GetComponentsInChildren<Renderer>(true);
            _origin = transform.position;
            _phase = Random.value * Mathf.PI * 2f;
            _health.Died += OnDied;
        }

        private void OnDestroy()
        {
            if (_health != null) _health.Died -= OnDied;
        }

        private void Update()
        {
            if (_health.IsDead)
            {
                if (_respawnAt > 0f && Time.time >= _respawnAt) Respawn();
                return;
            }

            if (!strafe) return;
            float span = strafeOffset.magnitude;
            if (span < 0.01f) return;
            // Triangle wave: constant speed with sharp direction changes, like a strafing player.
            _phase += strafeSpeed / span * Time.deltaTime;
            float t = Mathf.PingPong(_phase, 1f);
            transform.position = _origin + strafeOffset * (t * 2f - 1f);
        }

        private void OnDied(DamageInfo info)
        {
            SetVisible(false);
            _respawnAt = Time.time + respawnDelay;
        }

        private void Respawn()
        {
            _respawnAt = -1f;
            _health.Revive();
            SetVisible(true);
        }

        private void SetVisible(bool visible)
        {
            for (int i = 0; i < _renderers.Length; i++) _renderers[i].enabled = visible;
        }
    }
}
