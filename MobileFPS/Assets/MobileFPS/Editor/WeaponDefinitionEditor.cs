using MobileFPS.Core;
using MobileFPS.Weapons;
using UnityEditor;
using UnityEngine;

namespace MobileFPS.EditorTools
{
    /// <summary>
    /// Weapon inspector with a live balance table: shots-to-kill and
    /// time-to-kill by range and hit zone, updated as you edit. Competitive
    /// balance is argued in TTK milliseconds, so designers should see them
    /// without leaving the inspector.
    /// </summary>
    [CustomEditor(typeof(WeaponDefinition))]
    internal sealed class WeaponDefinitionEditor : UnityEditor.Editor
    {
        private static readonly float[] Distances = { 5f, 10f, 20f, 30f, 45f, 60f, 100f };
        private float _targetHealth = 100f;
        private bool _showTable = true;

        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();

            var weapon = (WeaponDefinition)target;
            EditorGUILayout.Space(10f);
            _showTable = EditorGUILayout.Foldout(_showTable, "Balance preview", true, EditorStyles.foldoutHeader);
            if (!_showTable) return;

            _targetHealth = EditorGUILayout.FloatField("Target health", _targetHealth);
            float dps = weapon.GetBaseDamage(10f) * weapon.zoneMultipliers.Get(HitZone.UpperTorso) * weapon.pelletsPerShot * weapon.roundsPerMinute / 60f;
            EditorGUILayout.LabelField($"Fire interval {weapon.SecondsBetweenShots * 1000f:0} ms   ~{dps:0} chest DPS at 10 m");

            using (new EditorGUILayout.HorizontalScope())
            {
                GUILayout.Label("Range", EditorStyles.miniBoldLabel, GUILayout.Width(55f));
                GUILayout.Label("Body STK", EditorStyles.miniBoldLabel, GUILayout.Width(60f));
                GUILayout.Label("Body TTK", EditorStyles.miniBoldLabel, GUILayout.Width(70f));
                GUILayout.Label("Head STK", EditorStyles.miniBoldLabel, GUILayout.Width(60f));
                GUILayout.Label("Head TTK", EditorStyles.miniBoldLabel, GUILayout.Width(70f));
            }

            foreach (float distance in Distances)
            {
                if (distance > weapon.maxRange) break;
                int bodyShots = weapon.ShotsToKill(distance, HitZone.UpperTorso, _targetHealth);
                int headShots = weapon.ShotsToKill(distance, HitZone.Head, _targetHealth);
                using (new EditorGUILayout.HorizontalScope())
                {
                    GUILayout.Label($"{distance:0} m", GUILayout.Width(55f));
                    GUILayout.Label(Format(bodyShots), GUILayout.Width(60f));
                    GUILayout.Label($"{weapon.TimeToKillMs(distance, HitZone.UpperTorso, _targetHealth):0} ms", GUILayout.Width(70f));
                    GUILayout.Label(Format(headShots), GUILayout.Width(60f));
                    GUILayout.Label($"{weapon.TimeToKillMs(distance, HitZone.Head, _targetHealth):0} ms", GUILayout.Width(70f));
                }
            }

            EditorGUILayout.HelpBox("TTK assumes every shot hits (all pellets for shotguns) with the first shot at t=0. Attachments with DamageRange modifiers stretch the brackets.", MessageType.None);
        }

        private static string Format(int shots) => shots == int.MaxValue ? "—" : shots.ToString();
    }
}
