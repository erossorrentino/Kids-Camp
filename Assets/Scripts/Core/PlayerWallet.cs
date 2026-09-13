using System;
using UnityEngine;

namespace CrimeCity.Core
{
    /// <summary>Tracks the player's cash. Every purchase and every heist payout flows through here.</summary>
    public class PlayerWallet : MonoBehaviour
    {
        public static PlayerWallet Instance { get; private set; }

        [SerializeField] private int startingCash = 5000;
        public int Cash { get; private set; }

        public event Action<int> OnCashChanged;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            Cash = startingCash;
        }

        public bool TrySpend(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            if (Cash < amount) return false;
            Cash -= amount;
            OnCashChanged?.Invoke(Cash);
            return true;
        }

        public void Deposit(int amount)
        {
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            Cash += amount;
            OnCashChanged?.Invoke(Cash);
        }
    }
}
