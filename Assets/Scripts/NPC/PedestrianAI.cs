using UnityEngine;
using UnityEngine.AI;
using CrimeCity.Wanted;
using CrimeCity.Core;

namespace CrimeCity.NPC
{
    /// <summary>
    /// A civilian pedestrian. Can be knocked down (defeated) or robbed for
    /// a small amount of cash. Getting defeated near other pedestrians
    /// counts as a witnessed crime and feeds the wanted system.
    /// </summary>
    [RequireComponent(typeof(NavMeshAgent))]
    public class PedestrianAI : MonoBehaviour
    {
        [SerializeField] private float wanderRadius = 25f;
        [SerializeField] private float wanderInterval = 6f;
        [SerializeField] private int minRobCash = 20;
        [SerializeField] private int maxRobCash = 300;
        [SerializeField] private float witnessRadius = 15f;

        public bool IsDown { get; private set; }
        public int CarriedCash { get; private set; }

        private NavMeshAgent _agent;
        private float _wanderTimer;

        private void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();
            CarriedCash = Random.Range(minRobCash, maxRobCash + 1);
        }

        private void Update()
        {
            if (IsDown) return;

            _wanderTimer -= Time.deltaTime;
            if (_wanderTimer <= 0f)
            {
                _wanderTimer = wanderInterval + Random.Range(-1.5f, 1.5f);
                PickNewWanderTarget();
            }
        }

        private void PickNewWanderTarget()
        {
            Vector3 randomDirection = Random.insideUnitSphere * wanderRadius;
            randomDirection += transform.position;
            if (NavMesh.SamplePosition(randomDirection, out var hit, wanderRadius, NavMesh.AllAreas))
            {
                _agent.SetDestination(hit.position);
            }
        }

        /// <summary>Called by weapon/melee hit logic. Not lethal-gore: the pedestrian is "taken down", not gibbed.</summary>
        public void TakeDown()
        {
            if (IsDown) return;
            IsDown = true;
            _agent.isStopped = true;

            if (AnyWitnessNearby())
            {
                WantedSystem.Instance?.ReportWitnessedKill();
            }
        }

        public bool TryRob(out int amountStolen)
        {
            amountStolen = 0;
            if (CarriedCash <= 0) return false;
            amountStolen = CarriedCash;
            CarriedCash = 0;
            PlayerWallet.Instance?.Deposit(amountStolen);
            WantedSystem.Instance?.ReportRobbery(severity: 1);
            return true;
        }

        private bool AnyWitnessNearby()
        {
            var hits = Physics.OverlapSphere(transform.position, witnessRadius);
            foreach (var hit in hits)
            {
                var ped = hit.GetComponent<PedestrianAI>();
                if (ped != null && ped != this && !ped.IsDown) return true;
            }
            return false;
        }
    }
}
