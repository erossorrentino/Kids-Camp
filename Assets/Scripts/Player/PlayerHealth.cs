using System;
using UnityEngine;

namespace CrimeCity.Player
{
    public class PlayerHealth : MonoBehaviour
    {
        [SerializeField] private int maxHealth = 100;
        [SerializeField] private int maxArmor = 100;

        public int Health { get; private set; }
        public int Armor { get; private set; }
        public bool IsDown { get; private set; }

        public event Action<int, int> OnHealthChanged; // health, armor
        public event Action OnPlayerDowned;

        private void Awake()
        {
            Health = maxHealth;
            Armor = 0;
        }

        public void TakeDamage(int amount)
        {
            if (IsDown || amount <= 0) return;

            if (Armor > 0)
            {
                int absorbed = Mathf.Min(Armor, amount);
                Armor -= absorbed;
                amount -= absorbed;
            }

            if (amount > 0)
            {
                Health = Mathf.Max(0, Health - amount);
            }

            OnHealthChanged?.Invoke(Health, Armor);

            if (Health <= 0)
            {
                IsDown = true;
                OnPlayerDowned?.Invoke();
            }
        }

        public void Heal(int amount)
        {
            Health = Mathf.Min(maxHealth, Health + amount);
            OnHealthChanged?.Invoke(Health, Armor);
        }

        public void AddArmor(int amount)
        {
            Armor = Mathf.Min(maxArmor, Armor + amount);
            OnHealthChanged?.Invoke(Health, Armor);
        }

        public void Respawn(Vector3 position)
        {
            transform.position = position;
            Health = maxHealth;
            Armor = 0;
            IsDown = false;
            OnHealthChanged?.Invoke(Health, Armor);
        }
    }
}
