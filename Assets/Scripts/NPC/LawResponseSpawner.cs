using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;
using CrimeCity.Wanted;

namespace CrimeCity.NPC
{
    /// <summary>
    /// Watches the wanted level and spawns/despawns the appropriate
    /// response force around the player: 1-2 stars is a couple of beat
    /// cops, 5-6 brings in SWAT vans, 9-10 brings in army units with
    /// military vehicles from the vehicle catalog. This is what turns the
    /// star meter into an actual on-screen chase.
    /// </summary>
    public class LawResponseSpawner : MonoBehaviour
    {
        [SerializeField] private Transform player;
        [SerializeField] private GameObject responderPrefab;
        [SerializeField] private float spawnRingRadius = 40f;
        [SerializeField] private float spawnCheckInterval = 3f;

        private static readonly Dictionary<ResponseForce, int> UnitsPerWave = new Dictionary<ResponseForce, int>
        {
            { ResponseForce.None, 0 },
            { ResponseForce.LocalPolice, 2 },
            { ResponseForce.PoliceWithRoadblocks, 4 },
            { ResponseForce.SWAT, 4 },
            { ResponseForce.NationalGuard, 6 },
            { ResponseForce.Military, 8 },
        };

        private readonly List<LawResponderAI> _activeResponders = new List<LawResponderAI>();
        private float _timer;
        private ResponseForce _currentForce = ResponseForce.None;

        private void OnEnable()
        {
            if (WantedSystem.Instance != null)
                WantedSystem.Instance.OnStarsChanged += HandleStarsChanged;
        }

        private void OnDisable()
        {
            if (WantedSystem.Instance != null)
                WantedSystem.Instance.OnStarsChanged -= HandleStarsChanged;
        }

        private void HandleStarsChanged(int stars)
        {
            var force = WantedSystem.Instance.CurrentResponse;
            if (force == ResponseForce.None)
            {
                DespawnAll();
                _currentForce = force;
                return;
            }

            if (force != _currentForce)
            {
                DespawnAll();
                _currentForce = force;
                SpawnWave(force);
            }
        }

        private void Update()
        {
            if (_currentForce == ResponseForce.None || player == null) return;
            _timer -= Time.deltaTime;
            if (_timer <= 0f)
            {
                _timer = spawnCheckInterval;
                TopUpWave(_currentForce);
            }
        }

        private void SpawnWave(ResponseForce force)
        {
            int count = UnitsPerWave[force];
            for (int i = 0; i < count; i++) SpawnOne(force);
        }

        private void TopUpWave(ResponseForce force)
        {
            _activeResponders.RemoveAll(r => r == null);
            int target = UnitsPerWave[force];
            while (_activeResponders.Count < target) SpawnOne(force);
        }

        private void SpawnOne(ResponseForce force)
        {
            if (responderPrefab == null || player == null) return;
            Vector2 offset2d = Random.insideUnitCircle.normalized * spawnRingRadius;
            Vector3 spawnPos = player.position + new Vector3(offset2d.x, 0f, offset2d.y);
            if (NavMesh.SamplePosition(spawnPos, out var hit, spawnRingRadius, NavMesh.AllAreas))
            {
                spawnPos = hit.position;
            }

            var go = Instantiate(responderPrefab, spawnPos, Quaternion.identity);
            var responder = go.GetComponent<LawResponderAI>();
            if (responder == null) responder = go.AddComponent<LawResponderAI>();
            responder.Force = force;
            responder.SetTarget(player);
            _activeResponders.Add(responder);
        }

        private void DespawnAll()
        {
            foreach (var r in _activeResponders)
            {
                if (r != null) Destroy(r.gameObject);
            }
            _activeResponders.Clear();
        }
    }
}
