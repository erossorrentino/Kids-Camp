using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using CrimeCity.Data;
using CrimeCity.Core;
using CrimeCity.Player;
using CrimeCity.Vehicles;
using CrimeCity.Wanted;

namespace CrimeCity.Missions
{
    public enum HeistOutcome { Success, PartialSuccess, Failed }

    /// <summary>
    /// The heist board and planning/execution flow. This is the house
    /// rule that replaces "walk in guns blazing": every heist lists a
    /// required getaway-vehicle category, a set of prep tools, and crew
    /// roles (see HeistDefinition.planning). You can launch under-prepped,
    /// but it costs you -- lower payout and an immediate alarm/star hit --
    /// so picking the right car and gearing up beforehand is the actual
    /// skill, not just the shootout.
    /// </summary>
    public class HeistManager : MonoBehaviour
    {
        public static HeistManager Instance { get; private set; }

        public event Action<HeistDefinition, HeistOutcome, int> OnHeistCompleted; // heist, outcome, payout

        private HeistDefinition _activeHeist;
        public HeistDefinition ActiveHeist => _activeHeist;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public List<HeistDefinition> GetHeistBoard(int maxDifficulty = 10) =>
            CatalogService.Instance == null
                ? new List<HeistDefinition>()
                : CatalogService.Instance.Heists.Where(h => h.difficulty <= maxDifficulty).ToList();

        /// <summary>How many of the heist's prep requirements the player currently satisfies, 0..1.</summary>
        public float EvaluatePrepReadiness(HeistDefinition heist, PlayerInventory inventory, VehicleController currentVehicle)
        {
            if (heist?.planning == null) return 1f;

            int total = 0;
            int satisfied = 0;

            total++;
            bool hasVehicle = currentVehicle != null &&
                               currentVehicle.Definition != null &&
                               currentVehicle.Definition.category == heist.planning.requiredVehicleCategory;
            if (hasVehicle) satisfied++;

            foreach (var tool in heist.planning.requiredTools ?? new List<string>())
            {
                total++;
                if (inventory.OwnedTools.Contains(tool)) satisfied++;
            }

            foreach (var role in heist.planning.requiredCrewRoles ?? new List<string>())
            {
                total++;
                if (inventory.HiredCrewRoles.Contains(role)) satisfied++;
            }

            return total == 0 ? 1f : (float)satisfied / total;
        }

        public bool BeginHeist(HeistDefinition heist)
        {
            if (_activeHeist != null) return false;
            _activeHeist = heist;
            return true;
        }

        /// <summary>
        /// Resolves the active heist. Call once the player reaches the
        /// heist's objective in-world. Readiness (from EvaluatePrepReadiness)
        /// determines payout scaling and whether the alarm trips immediately.
        /// </summary>
        public (HeistOutcome outcome, int payout) ResolveHeist(float prepReadiness)
        {
            if (_activeHeist == null) return (HeistOutcome.Failed, 0);
            var heist = _activeHeist;

            HeistOutcome outcome;
            int payout;

            if (prepReadiness >= 0.99f)
            {
                outcome = HeistOutcome.Success;
                payout = UnityEngine.Random.Range(heist.payoutMin, heist.payoutMax + 1);
            }
            else if (prepReadiness >= 0.5f)
            {
                outcome = HeistOutcome.PartialSuccess;
                int scaledMax = Mathf.RoundToInt(Mathf.Lerp(heist.payoutMin, heist.payoutMax, prepReadiness));
                payout = UnityEngine.Random.Range(heist.payoutMin, Mathf.Max(heist.payoutMin + 1, scaledMax));
                WantedSystem.Instance?.ReportHeistAlarm(heist.starGainOnAlarm);
            }
            else
            {
                outcome = HeistOutcome.Failed;
                payout = 0;
                WantedSystem.Instance?.ReportHeistAlarm(heist.starGainOnAlarm + 1);
            }

            if (payout > 0) PlayerWallet.Instance?.Deposit(payout);

            OnHeistCompleted?.Invoke(heist, outcome, payout);
            _activeHeist = null;
            return (outcome, payout);
        }

        public void AbandonHeist() => _activeHeist = null;
    }
}
