using System.Collections.Generic;
using System.Text;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Analytics
{
    /// <summary>Destination for analytics (Firebase, GameAnalytics, Unity Analytics, your own pipeline).</summary>
    public interface IAnalyticsSink
    {
        void LogEvent(string name, IReadOnlyList<KeyValuePair<string, string>> parameters);
        void LogRevenue(string productId, double amount, string currencyCode, string transactionId);
        void SetUserProperty(string key, string value);
    }

    /// <summary>
    /// Thin analytics facade. Every economy source and sink, ad impression, IAP,
    /// level-up, daily claim and challenge completion goes through here. That data
    /// is how you tune ARPDAU, D1/D7/D30 retention and economy inflation after
    /// launch; a monetized game without it is flying blind.
    ///
    /// Meta events are infrequent (per match, per menu action), so this facade
    /// favors convenience over zero-allocation. Never log per frame or per shot.
    /// </summary>
    public static class Telemetry
    {
        private static readonly List<IAnalyticsSink> s_sinks = new List<IAnalyticsSink>(4);
        private static readonly List<KeyValuePair<string, string>> s_scratch = new List<KeyValuePair<string, string>>(8);

        static Telemetry()
        {
            StaticReset.Register(() => s_sinks.Clear());
        }

        public static void AddSink(IAnalyticsSink sink)
        {
            if (sink != null && !s_sinks.Contains(sink)) s_sinks.Add(sink);
        }

        public static void RemoveSink(IAnalyticsSink sink) => s_sinks.Remove(sink);

        public static void Log(string name) => Dispatch(name);

        public static void Log(string name, string k1, object v1) => Dispatch(name, k1, v1);

        public static void Log(string name, string k1, object v1, string k2, object v2) => Dispatch(name, k1, v1, k2, v2);

        public static void Log(string name, string k1, object v1, string k2, object v2, string k3, object v3)
            => Dispatch(name, k1, v1, k2, v2, k3, v3);

        public static void Revenue(string productId, double amount, string currencyCode, string transactionId)
        {
            for (int i = 0; i < s_sinks.Count; i++) s_sinks[i].LogRevenue(productId, amount, currencyCode, transactionId);
        }

        public static void SetUserProperty(string key, string value)
        {
            for (int i = 0; i < s_sinks.Count; i++) s_sinks[i].SetUserProperty(key, value);
        }

        private static void Dispatch(string name, string k1 = null, object v1 = null, string k2 = null, object v2 = null, string k3 = null, object v3 = null)
        {
            if (s_sinks.Count == 0) return;
            s_scratch.Clear();
            if (k1 != null) s_scratch.Add(new KeyValuePair<string, string>(k1, v1?.ToString() ?? string.Empty));
            if (k2 != null) s_scratch.Add(new KeyValuePair<string, string>(k2, v2?.ToString() ?? string.Empty));
            if (k3 != null) s_scratch.Add(new KeyValuePair<string, string>(k3, v3?.ToString() ?? string.Empty));
            for (int i = 0; i < s_sinks.Count; i++) s_sinks[i].LogEvent(name, s_scratch);
        }
    }

    /// <summary>Development sink: prints events to the console.</summary>
    public sealed class DebugLogAnalyticsSink : IAnalyticsSink
    {
        public void LogEvent(string name, IReadOnlyList<KeyValuePair<string, string>> parameters)
        {
            var builder = new StringBuilder("[Analytics] ").Append(name);
            for (int i = 0; i < parameters.Count; i++) builder.Append(' ').Append(parameters[i].Key).Append('=').Append(parameters[i].Value);
            Debug.Log(builder.ToString());
        }

        public void LogRevenue(string productId, double amount, string currencyCode, string transactionId)
        {
            Debug.Log($"[Analytics] revenue product={productId} amount={amount} {currencyCode} tx={transactionId}");
        }

        public void SetUserProperty(string key, string value)
        {
            Debug.Log($"[Analytics] user_property {key}={value}");
        }
    }
}
