using UnityEngine;
using CrimeCity.Core;
using CrimeCity.Wanted;
using CrimeCity.Player;

namespace CrimeCity.UI
{
    /// <summary>
    /// Minimal OnGUI readout (cash, health/armor, wanted stars, active
    /// heist) so the systems are checkable in the Editor's Game view
    /// before any real UI art/Canvas work is done. Not meant to ship.
    /// </summary>
    public class DebugHUD : MonoBehaviour
    {
        [SerializeField] private PlayerHealth playerHealth;

        private void OnGUI()
        {
            GUILayout.BeginArea(new Rect(10, 10, 320, 160), GUI.skin.box);
            GUILayout.Label($"Cash: ${(PlayerWallet.Instance != null ? PlayerWallet.Instance.Cash : 0):N0}");

            if (playerHealth != null)
            {
                GUILayout.Label($"Health: {playerHealth.Health}  Armor: {playerHealth.Armor}");
            }

            int stars = WantedSystem.Instance != null ? WantedSystem.Instance.Stars : 0;
            GUILayout.Label($"Wanted: {new string('*', stars)}{new string('-', WantedSystem.MaxStars - stars)} ({stars}/{WantedSystem.MaxStars})");

            if (WantedSystem.Instance != null)
            {
                GUILayout.Label($"Response: {WantedSystem.Instance.CurrentResponse}");
            }

            var activeHeist = Missions.HeistManager.Instance != null ? Missions.HeistManager.Instance.ActiveHeist : null;
            GUILayout.Label(activeHeist != null ? $"Heist: {activeHeist.name}" : "Heist: none active");

            GUILayout.EndArea();
        }
    }
}
