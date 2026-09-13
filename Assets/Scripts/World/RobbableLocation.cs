using UnityEngine;
using CrimeCity.Core;
using CrimeCity.Wanted;

namespace CrimeCity.World
{
    public enum RobbableKind { GasStation, ConvenienceStore, Bank }

    /// <summary>
    /// A robbable business. Banks pay the most but demand the player
    /// linger (cracking the vault takes time, during which an alarm
    /// timer runs) and always raise a multi-star alert; gas stations and
    /// stores are quick smash-and-grabs for small cash and low heat.
    /// </summary>
    public class RobbableLocation : MonoBehaviour
    {
        [SerializeField] private RobbableKind kind;
        [SerializeField] private int payoutMin = 100;
        [SerializeField] private int payoutMax = 500;
        [SerializeField] private float robDurationSeconds = 1.5f;
        [SerializeField] private float cooldownSeconds = 180f;
        [SerializeField] private int starGain = 1;

        private bool _onCooldown;
        private float _robProgress;
        private bool _playerInRange;

        private void Awake()
        {
            if (kind == RobbableKind.Bank)
            {
                payoutMin = Mathf.Max(payoutMin, 5000);
                payoutMax = Mathf.Max(payoutMax, 25000);
                robDurationSeconds = Mathf.Max(robDurationSeconds, 8f);
                starGain = Mathf.Max(starGain, 3);
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (other.CompareTag("Player")) _playerInRange = true;
        }

        private void OnTriggerExit(Collider other)
        {
            if (other.CompareTag("Player"))
            {
                _playerInRange = false;
                _robProgress = 0f;
            }
        }

        private void Update()
        {
            if (_onCooldown || !_playerInRange) return;
            if (!Input.GetKey(KeyCode.E)) { _robProgress = 0f; return; }

            _robProgress += Time.deltaTime;
            if (_robProgress >= robDurationSeconds)
            {
                CompleteRobbery();
            }
        }

        private void CompleteRobbery()
        {
            int payout = Random.Range(payoutMin, payoutMax + 1);
            PlayerWallet.Instance?.Deposit(payout);
            WantedSystem.Instance?.ReportRobbery(starGain);

            _onCooldown = true;
            _robProgress = 0f;
            Invoke(nameof(ClearCooldown), cooldownSeconds);
        }

        private void ClearCooldown() => _onCooldown = false;
    }
}
