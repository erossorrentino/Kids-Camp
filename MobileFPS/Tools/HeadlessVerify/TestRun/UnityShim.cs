// Minimal managed re-implementation of the UnityEngine API surface used by the
// pure-logic code under test. Lets NUnit run the real game code outside the engine.
// Math types follow Unity's documented semantics (Vector3 == is approximate,
// Equals is exact; Angle clamps; Normalize uses 1e-5 epsilon).
using System;
using System.Collections.Generic;

namespace UnityEngine
{
    public enum RuntimeInitializeLoadType { AfterSceneLoad, BeforeSceneLoad, AfterAssembliesLoaded, BeforeSplashScreen, SubsystemRegistration }
    public enum LogType { Error, Assert, Warning, Log, Exception }

    [AttributeUsage(AttributeTargets.Method)] public sealed class RuntimeInitializeOnLoadMethodAttribute : Attribute { public RuntimeInitializeOnLoadMethodAttribute() { } public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType t) { } }
    [AttributeUsage(AttributeTargets.Field)] public sealed class SerializeField : Attribute { }
    [AttributeUsage(AttributeTargets.Field, AllowMultiple = true)] public sealed class HeaderAttribute : Attribute { public HeaderAttribute(string h) { } }
    [AttributeUsage(AttributeTargets.Field)] public sealed class TooltipAttribute : Attribute { public TooltipAttribute(string t) { } }
    [AttributeUsage(AttributeTargets.Field)] public sealed class RangeAttribute : Attribute { public RangeAttribute(float a, float b) { } }
    [AttributeUsage(AttributeTargets.Field)] public sealed class TextAreaAttribute : Attribute { }
    [AttributeUsage(AttributeTargets.Field, AllowMultiple = true)] public sealed class SpaceAttribute : Attribute { public SpaceAttribute() { } public SpaceAttribute(float h) { } }
    [AttributeUsage(AttributeTargets.Class)] public sealed class CreateAssetMenuAttribute : Attribute { public string menuName { get; set; } public string fileName { get; set; } public int order { get; set; } }
    [AttributeUsage(AttributeTargets.Class)] public sealed class DefaultExecutionOrder : Attribute { public DefaultExecutionOrder(int o) { } }
    [AttributeUsage(AttributeTargets.Class)] public sealed class DisallowMultipleComponent : Attribute { }
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = true)] public sealed class RequireComponent : Attribute { public RequireComponent(Type a) { } public RequireComponent(Type a, Type b) { } }

    public class Object
    {
        public string name { get; set; }
        public static void Destroy(Object o) { }
        public static void DontDestroyOnLoad(Object o) { }
        public static T FindFirstObjectByType<T>() where T : Object => null;
    }
    public class ScriptableObject : Object
    {
        public static T CreateInstance<T>() where T : ScriptableObject => (T)Activator.CreateInstance(typeof(T), true);
        public static ScriptableObject CreateInstance(Type t) => (ScriptableObject)Activator.CreateInstance(t, true);
    }
    public class Transform : Component
    {
        public Transform parent { get; set; }
        public void SetParent(Transform p, bool worldPositionStays) { parent = p; }
    }
    public class Component : Object
    {
        public GameObject gameObject { get; internal set; }
        public Transform transform => gameObject?.transform;
    }
    public class Behaviour : Component { public bool enabled { get; set; } = true; }
    public class MonoBehaviour : Behaviour { }
    public sealed class GameObject : Object
    {
        private readonly List<Component> _components = new List<Component>();
        public Transform transform { get; }
        public GameObject() : this("GameObject") { }
        public GameObject(string name) { this.name = name; transform = new Transform { gameObject = this }; }
        public T AddComponent<T>() where T : Component { var c = (T)Activator.CreateInstance(typeof(T), true); c.gameObject = this; _components.Add(c); return c; }
        public void SetActive(bool value) { }
    }
    public sealed class Sprite : Object { }
    public sealed class AudioClip : Object { }
    public sealed class Material : Object { }

    public static class Resources { public static T Load<T>(string path) where T : Object => null; }
    public static class AudioListener { public static bool pause { get; set; } }
    public static class Application { public static bool isEditor => true; public static bool isMobilePlatform => false; }
    public static class Time
    {
        private static readonly System.Diagnostics.Stopwatch s_clock = System.Diagnostics.Stopwatch.StartNew();
        public static double realtimeSinceStartupAsDouble => s_clock.Elapsed.TotalSeconds;
        public static double timeAsDouble => s_clock.Elapsed.TotalSeconds;
        public static float time => (float)timeAsDouble;
        public static float unscaledTime => (float)timeAsDouble;
        public static float deltaTime => 1f / 60f;
        public static float unscaledDeltaTime => 1f / 60f;
        public static int frameCount => 0;
    }
    public static class Debug
    {
        public static bool isDebugBuild => true;
        public static readonly List<string> Logs = new List<string>();
        public static void Log(object m) => Logs.Add("LOG " + m);
        public static void LogWarning(object m) => Logs.Add("WARN " + m);
        public static void LogWarning(object m, Object ctx) => LogWarning(m);
        public static void LogError(object m) => Logs.Add("ERROR " + m);
        public static void LogError(object m, Object ctx) => LogError(m);
        public static void LogException(Exception e) => Logs.Add("EXCEPTION " + e.Message);
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1f) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white => new Color(1, 1, 1, 1);
        public static Color yellow => new Color(1, 0.92f, 0.016f, 1);
    }

    public static class Mathf
    {
        public const float PI = (float)Math.PI;
        public const float Deg2Rad = PI / 180f;
        public const float Rad2Deg = 180f / PI;
        public const float Epsilon = 1.401298E-45f;
        public static float Abs(float v) => Math.Abs(v);
        public static int Abs(int v) => Math.Abs(v);
        public static float Min(float a, float b) => a < b ? a : b;
        public static int Min(int a, int b) => a < b ? a : b;
        public static float Max(float a, float b) => a > b ? a : b;
        public static int Max(int a, int b) => a > b ? a : b;
        public static float Clamp(float v, float min, float max) => v < min ? min : v > max ? max : v;
        public static int Clamp(int v, int min, int max) => v < min ? min : v > max ? max : v;
        public static float Clamp01(float v) => v < 0f ? 0f : v > 1f ? 1f : v;
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
        public static float LerpUnclamped(float a, float b, float t) => a + (b - a) * t;
        public static float MoveTowards(float current, float target, float maxDelta) => Abs(target - current) <= maxDelta ? target : current + Math.Sign(target - current) * maxDelta;
        public static float Sqrt(float v) => (float)Math.Sqrt(v);
        public static float Exp(float v) => (float)Math.Exp(v);
        public static float Pow(float a, float b) => (float)Math.Pow(a, b);
        public static float Sin(float v) => (float)Math.Sin(v);
        public static float Cos(float v) => (float)Math.Cos(v);
        public static float Tan(float v) => (float)Math.Tan(v);
        public static float Atan(float v) => (float)Math.Atan(v);
        public static float Atan2(float y, float x) => (float)Math.Atan2(y, x);
        public static float Acos(float v) => (float)Math.Acos(v);
        public static float Floor(float v) => (float)Math.Floor(v);
        public static float Ceil(float v) => (float)Math.Ceiling(v);
        public static float Round(float v) => (float)Math.Round(v, MidpointRounding.ToEven);
        public static int FloorToInt(float v) => (int)Math.Floor(v);
        public static int CeilToInt(float v) => (int)Math.Ceiling(v);
        public static int RoundToInt(float v) => (int)Math.Round(v, MidpointRounding.ToEven);
        public static float Sign(float v) => v >= 0f ? 1f : -1f;
        public static float Repeat(float t, float length) => Clamp(t - Floor(t / length) * length, 0f, length);
        public static float PingPong(float t, float length) { t = Repeat(t, length * 2f); return length - Abs(t - length); }
        public static bool Approximately(float a, float b) => Abs(b - a) < Max(1E-06f * Max(Abs(a), Abs(b)), Epsilon * 8f);
    }

    public struct Vector2 : IEquatable<Vector2>
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => new Vector2(0, 0);
        public static Vector2 one => new Vector2(1, 1);
        public static Vector2 up => new Vector2(0, 1);
        public float sqrMagnitude => x * x + y * y;
        public float magnitude => (float)Math.Sqrt(sqrMagnitude);
        public Vector2 normalized { get { float m = magnitude; return m > 1E-05f ? this / m : zero; } }
        public static float Dot(Vector2 a, Vector2 b) => a.x * b.x + a.y * b.y;
        public static Vector2 Lerp(Vector2 a, Vector2 b, float t) { t = Mathf.Clamp01(t); return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
        public static Vector2 ClampMagnitude(Vector2 v, float max) { float s = v.sqrMagnitude; if (s > max * max) { float m = (float)Math.Sqrt(s); return v / m * max; } return v; }
        public static float Angle(Vector2 a, Vector2 b) { float d = (float)Math.Sqrt(a.sqrMagnitude * b.sqrMagnitude); if (d < 1E-15f) return 0f; return (float)Math.Acos(Mathf.Clamp(Dot(a, b) / d, -1f, 1f)) * Mathf.Rad2Deg; }
        public static float Distance(Vector2 a, Vector2 b) => (a - b).magnitude;
        public static Vector2 operator +(Vector2 a, Vector2 b) => new Vector2(a.x + b.x, a.y + b.y);
        public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.x - b.x, a.y - b.y);
        public static Vector2 operator -(Vector2 a) => new Vector2(-a.x, -a.y);
        public static Vector2 operator *(Vector2 a, float d) => new Vector2(a.x * d, a.y * d);
        public static Vector2 operator *(float d, Vector2 a) => new Vector2(a.x * d, a.y * d);
        public static Vector2 operator /(Vector2 a, float d) => new Vector2(a.x / d, a.y / d);
        public static bool operator ==(Vector2 a, Vector2 b) => (a - b).sqrMagnitude < 9.99999944E-11f;
        public static bool operator !=(Vector2 a, Vector2 b) => !(a == b);
        public bool Equals(Vector2 o) => x.Equals(o.x) && y.Equals(o.y);
        public override bool Equals(object o) => o is Vector2 v && Equals(v);
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2);
        public override string ToString() => $"({x:F2}, {y:F2})";
    }

    public struct Vector3 : IEquatable<Vector3>
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => new Vector3(0, 0, 0);
        public static Vector3 one => new Vector3(1, 1, 1);
        public static Vector3 up => new Vector3(0, 1, 0);
        public static Vector3 down => new Vector3(0, -1, 0);
        public static Vector3 left => new Vector3(-1, 0, 0);
        public static Vector3 right => new Vector3(1, 0, 0);
        public static Vector3 forward => new Vector3(0, 0, 1);
        public static Vector3 back => new Vector3(0, 0, -1);
        public float sqrMagnitude => x * x + y * y + z * z;
        public float magnitude => (float)Math.Sqrt(sqrMagnitude);
        public Vector3 normalized { get { float m = magnitude; return m > 1E-05f ? this / m : zero; } }
        public void Normalize() { this = normalized; }
        public static float Dot(Vector3 a, Vector3 b) => a.x * b.x + a.y * b.y + a.z * b.z;
        public static Vector3 Cross(Vector3 a, Vector3 b) => new Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
        public static float Distance(Vector3 a, Vector3 b) => (a - b).magnitude;
        public static Vector3 Lerp(Vector3 a, Vector3 b, float t) => LerpUnclamped(a, b, Mathf.Clamp01(t));
        public static Vector3 LerpUnclamped(Vector3 a, Vector3 b, float t) => new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
        public static Vector3 Scale(Vector3 a, Vector3 b) => new Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
        public static Vector3 ClampMagnitude(Vector3 v, float max) { float s = v.sqrMagnitude; if (s > max * max) { float m = (float)Math.Sqrt(s); return v / m * max; } return v; }
        public static float Angle(Vector3 a, Vector3 b) { float d = (float)Math.Sqrt(a.sqrMagnitude * b.sqrMagnitude); if (d < 1E-15f) return 0f; return (float)Math.Acos(Mathf.Clamp(Dot(a, b) / d, -1f, 1f)) * Mathf.Rad2Deg; }
        public static Vector3 ProjectOnPlane(Vector3 v, Vector3 n) { float s = Dot(n, n); if (s < Mathf.Epsilon) return v; return v - n * (Dot(v, n) / s); }
        public static Vector3 MoveTowards(Vector3 c, Vector3 t, float maxDelta) { Vector3 d = t - c; float m = d.magnitude; if (m <= maxDelta || m == 0f) return t; return c + d / m * maxDelta; }
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator -(Vector3 a) => new Vector3(-a.x, -a.y, -a.z);
        public static Vector3 operator *(Vector3 a, float d) => new Vector3(a.x * d, a.y * d, a.z * d);
        public static Vector3 operator *(float d, Vector3 a) => new Vector3(a.x * d, a.y * d, a.z * d);
        public static Vector3 operator /(Vector3 a, float d) => new Vector3(a.x / d, a.y / d, a.z / d);
        public static bool operator ==(Vector3 a, Vector3 b) => (a - b).sqrMagnitude < 9.99999944E-11f;
        public static bool operator !=(Vector3 a, Vector3 b) => !(a == b);
        public bool Equals(Vector3 o) => x.Equals(o.x) && y.Equals(o.y) && z.Equals(o.z);
        public override bool Equals(object o) => o is Vector3 v && Equals(v);
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2) ^ (z.GetHashCode() >> 2);
        public override string ToString() => $"({x:F2}, {y:F2}, {z:F2})";
    }
}
