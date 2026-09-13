using UnityEngine;
using CrimeCity.Core;
using CrimeCity.Player;

namespace CrimeCity.Missions
{
    /// <summary>Where the player buys prep tools (lockpicks, hacking rigs, etc.) and hires crew roles ahead of a heist.</summary>
    public class HeistPrepVendor : MonoBehaviour
    {
        [System.Serializable]
        public struct ToolOffer { public string toolId; public int price; }

        [System.Serializable]
        public struct CrewOffer { public string role; public int hireFee; }

        [SerializeField] private ToolOffer[] tools;
        [SerializeField] private CrewOffer[] crew;

        public bool BuyTool(string toolId, PlayerInventory buyer, out string error)
        {
            error = null;
            foreach (var offer in tools)
            {
                if (offer.toolId != toolId) continue;
                if (!PlayerWallet.Instance.TrySpend(offer.price))
                {
                    error = $"Not enough cash. Need ${offer.price:N0}.";
                    return false;
                }
                buyer.AddTool(toolId);
                return true;
            }
            error = "That tool isn't sold here.";
            return false;
        }

        public bool HireCrew(string role, PlayerInventory buyer, out string error)
        {
            error = null;
            foreach (var offer in crew)
            {
                if (offer.role != role) continue;
                if (!PlayerWallet.Instance.TrySpend(offer.hireFee))
                {
                    error = $"Not enough cash. Need ${offer.hireFee:N0}.";
                    return false;
                }
                buyer.HireCrew(role);
                return true;
            }
            error = "No one with that role is available.";
            return false;
        }
    }
}
