// Harness-only: APIs that exist in Unity's Android/iOS player assemblies but are
// missing from the desktop reference assemblies used for this compile check.
namespace UnityEngine
{
    public static class Handheld { public static void Vibrate() { } }
}
