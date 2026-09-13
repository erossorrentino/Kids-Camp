using UnityEngine;
using UnityEngine.AI;
using CrimeCity.Wanted;

namespace CrimeCity.NPC
{
    /// <summary>
    /// Shared behaviour for anything sent after the player once wanted
    /// stars are high enough: beat cop, SWAT operator, National Guard
    /// trooper, or army soldier. Which ResponseForce this instance
    /// represents is set by the spawner (see LawResponseSpawner) so one
    /// script covers the whole 1-10 star escalation instead of five
    /// near-duplicate classes.
    /// </summary>
    [RequireComponent(typeof(NavMeshAgent))]
    public class LawResponderAI : MonoBehaviour
    {
        public ResponseForce Force { get; set; }
        [SerializeField] private float pursuitSpeed = 6f;
        [SerializeField] private float engageRange = 12f;
        [SerializeField] private int damagePerHit = 8;
        [SerializeField] private float fireInterval = 1.2f;

        private NavMeshAgent _agent;
        private Transform _target;
        private float _fireTimer;

        private void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();
            _agent.speed = pursuitSpeed;
        }

        public void SetTarget(Transform target) => _target = target;

        private void Update()
        {
            if (_target == null) return;
            if (WantedSystem.Instance != null && WantedSystem.Instance.Stars <= 0)
            {
                _agent.isStopped = true;
                return;
            }

            float dist = Vector3.Distance(transform.position, _target.position);
            if (dist > engageRange)
            {
                _agent.isStopped = false;
                _agent.SetDestination(_target.position);
            }
            else
            {
                _agent.isStopped = true;
                transform.LookAt(new Vector3(_target.position.x, transform.position.y, _target.position.z));
                _fireTimer -= Time.deltaTime;
                if (_fireTimer <= 0f)
                {
                    _fireTimer = fireInterval;
                    Engage();
                }
            }
        }

        private void Engage()
        {
            var health = _target.GetComponent<CrimeCity.Player.PlayerHealth>();
            health?.TakeDamage(damagePerHit);
        }
    }
}
