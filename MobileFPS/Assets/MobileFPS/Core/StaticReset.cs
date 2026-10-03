using System;
using System.Collections.Generic;
using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Resets static state when entering Play Mode with Domain Reload disabled
    /// (Project Settings > Editor > Enter Play Mode Options).
    ///
    /// Turning domain reload off makes entering Play Mode near-instant, which on a
    /// big mobile project saves minutes per iteration. The catch is that statics
    /// survive between play sessions. Generic types (Singleton&lt;T&gt;, EventBus&lt;T&gt;)
    /// cannot carry [RuntimeInitializeOnLoadMethod] themselves, so they register a
    /// reset callback here from their static constructor instead.
    /// </summary>
    public static class StaticReset
    {
        private static readonly List<Action> s_resetActions = new List<Action>(64);

        public static void Register(Action resetAction)
        {
            if (resetAction == null) throw new ArgumentNullException(nameof(resetAction));
            lock (s_resetActions) s_resetActions.Add(resetAction);
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetAll()
        {
            // The list itself is intentionally NOT cleared: static constructors do not
            // re-run without a domain reload, so the registrations must persist.
            lock (s_resetActions)
            {
                for (int i = 0; i < s_resetActions.Count; i++)
                {
                    try { s_resetActions[i](); }
                    catch (Exception e) { Debug.LogException(e); }
                }
            }
        }
    }
}
