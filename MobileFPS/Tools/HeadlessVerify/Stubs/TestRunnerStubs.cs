// Harness-only stub of UnityEngine.TestTools.LogAssert (com.unity.test-framework).
using System.Text.RegularExpressions;
namespace UnityEngine.TestTools
{
    public static class LogAssert
    {
        public static void Expect(LogType type, Regex message) { }
        public static void Expect(LogType type, string message) { }
        public static bool ignoreFailingMessages { get; set; }
    }
}
