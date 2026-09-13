using System;
using System.Collections.Generic;
using UnityEngine;

namespace CrimeCity.Wanted
{
    public enum ResponseForce
    {
        None,
        LocalPolice,
        PoliceWithRoadblocks,
        SWAT,
        NationalGuard,
        Military,
    }

    /// <summary>
    /// The 1-10 star wanted meter. Stars come from crimes witnessed by NPCs
    /// or triggered alarms, not from a flat "kills = stars" counter -- two
    /// witnessed killings is what earns the first star (matches the spec:
    /// killing is a witnessed crime, not a free action), but robbing a
    /// store, tripping a heist alarm, or getting seen boosting a car all
    /// add heat too.
    /// </summary>
    public class WantedSystem : MonoBehaviour
    {
        public static WantedSystem Instance { get; private set; }

        public const int MaxStars = 10;

        [SerializeField] private float starDecaySeconds = 25f; // time out of sight before a star drops
        [SerializeField] private int witnessedKillsForFirstStar = 2;

        public int Stars { get; private set; }
        public event Action<int> OnStarsChanged;

        private int _witnessedKillCount;
        private float _timeSinceLastCrime;
        private bool _hidden;

        private static readonly Dictionary<int, ResponseForce> ResponseByStar = new Dictionary<int, ResponseForce>
        {
            { 0, ResponseForce.None },
            { 1, ResponseForce.LocalPolice },
            { 2, ResponseForce.LocalPolice },
            { 3, ResponseForce.PoliceWithRoadblocks },
            { 4, ResponseForce.PoliceWithRoadblocks },
            { 5, ResponseForce.SWAT },
            { 6, ResponseForce.SWAT },
            { 7, ResponseForce.NationalGuard },
            { 8, ResponseForce.NationalGuard },
            { 9, ResponseForce.Military },
            { 10, ResponseForce.Military },
        };

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Update()
        {
            if (Stars <= 0) return;

            if (_hidden)
            {
                _timeSinceLastCrime += Time.deltaTime;
                if (_timeSinceLastCrime >= starDecaySeconds)
                {
                    _timeSinceLastCrime = 0f;
                    SetStars(Stars - 1);
                }
            }
            else
            {
                _timeSinceLastCrime = 0f;
            }
        }

        /// <summary>Call from vision/detection logic each frame: is any lawman currently able to see the player?</summary>
        public void SetHidden(bool hidden) => _hidden = hidden;

        public void ReportWitnessedKill()
        {
            _witnessedKillCount++;
            if (_witnessedKillCount == witnessedKillsForFirstStar && Stars < 1)
            {
                SetStars(1);
            }
            else if (_witnessedKillCount > witnessedKillsForFirstStar)
            {
                AddStars(1);
            }
        }

        public void ReportRobbery(int severity = 1) => AddStars(severity);

        public void ReportHeistAlarm(int starGain) => AddStars(starGain);

        public void ReportAssaultOnLaw(int severity = 2) => AddStars(severity);

        public void AddStars(int amount) => SetStars(Stars + amount);

        public void ClearWanted() => SetStars(0);

        private void SetStars(int value)
        {
            int clamped = Mathf.Clamp(value, 0, MaxStars);
            if (clamped == Stars) return;
            Stars = clamped;
            _timeSinceLastCrime = 0f;
            OnStarsChanged?.Invoke(Stars);
        }

        public ResponseForce CurrentResponse => ResponseByStar[Stars];
    }
}
