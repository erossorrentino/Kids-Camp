using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace MobileFPS.EditorTools
{
    /// <summary>Helpers shared by the setup tools: idempotent asset creation and private-field wiring.</summary>
    internal static class EditorAssetUtility
    {
        public const string GeneratedRoot = "Assets/MobileFPS/Generated";
        public const string ResourcesRoot = "Assets/MobileFPS/Resources/MobileFPS";

        /// <summary>Loads the asset at <paramref name="path"/>, or creates it with <paramref name="initialize"/>. Never overwrites designer edits.</summary>
        public static T LoadOrCreate<T>(string path, Action<T> initialize) where T : ScriptableObject
        {
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null) return existing;

            EnsureFolder(Path.GetDirectoryName(path)?.Replace('\\', '/'));
            T asset = ScriptableObject.CreateInstance<T>();
            asset.name = Path.GetFileNameWithoutExtension(path);
            initialize?.Invoke(asset);
            AssetDatabase.CreateAsset(asset, path);
            return asset;
        }

        public static void EnsureFolder(string folder)
        {
            if (string.IsNullOrEmpty(folder) || AssetDatabase.IsValidFolder(folder)) return;
            string parent = Path.GetDirectoryName(folder)?.Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(folder));
        }

        /// <summary>Saves <paramref name="root"/> as a prefab (or returns the existing one) and destroys the temporary instance.</summary>
        public static GameObject SavePrefab(GameObject root, string path)
        {
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (existing != null)
            {
                Object.DestroyImmediate(root);
                return existing;
            }
            EnsureFolder(Path.GetDirectoryName(path)?.Replace('\\', '/'));
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
            return prefab;
        }

        /// <summary>Pipeline-agnostic lit material (Built-in Standard or the active SRP's default shader).</summary>
        public static Material LitMaterial(string name, Color color)
        {
            string path = $"{GeneratedRoot}/Materials/{name}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null) return existing;

            Shader shader = GraphicsSettings.currentRenderPipeline != null
                ? GraphicsSettings.currentRenderPipeline.defaultShader
                : Shader.Find("Standard");
            var material = new Material(shader) { name = name, color = color };
            EnsureFolder($"{GeneratedRoot}/Materials");
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        public static Material ParticleMaterial()
        {
            if (GraphicsSettings.currentRenderPipeline != null && GraphicsSettings.currentRenderPipeline.defaultParticleMaterial != null)
            {
                return GraphicsSettings.currentRenderPipeline.defaultParticleMaterial;
            }
            return AssetDatabase.GetBuiltinExtraResource<Material>("Default-ParticleSystem.mat");
        }

        // ---- SerializedObject wiring (for [SerializeField] private fields) ----

        public static void Set(Object target, string field, Object value)
        {
            Edit(target, field, p => p.objectReferenceValue = value);
        }

        public static void Set(Object target, string field, bool value) => Edit(target, field, p => p.boolValue = value);
        public static void Set(Object target, string field, int value) => Edit(target, field, p => p.intValue = value);
        public static void Set(Object target, string field, float value) => Edit(target, field, p => p.floatValue = value);
        public static void Set(Object target, string field, string value) => Edit(target, field, p => p.stringValue = value);
        public static void Set(Object target, string field, Vector3 value) => Edit(target, field, p => p.vector3Value = value);
        public static void SetEnum(Object target, string field, int enumValueIndex) => Edit(target, field, p => p.enumValueIndex = enumValueIndex);
        public static void SetMask(Object target, string field, int mask) => Edit(target, field, p => p.intValue = mask);

        public static void SetArray(Object target, string field, Object[] values)
        {
            Edit(target, field, p =>
            {
                p.arraySize = values.Length;
                for (int i = 0; i < values.Length; i++) p.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
            });
        }

        private static void Edit(Object target, string field, Action<SerializedProperty> apply)
        {
            var serialized = new SerializedObject(target);
            SerializedProperty property = serialized.FindProperty(field);
            if (property == null)
            {
                Debug.LogError($"[MobileFPS Setup] {target.GetType().Name} has no serialized field '{field}'.", target);
                return;
            }
            apply(property);
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
