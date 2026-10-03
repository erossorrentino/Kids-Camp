using System;
using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>Marker interface for events carried by <see cref="EventBus{T}"/>.</summary>
    public interface IGameEvent { }

    /// <summary>Handler signature: events are passed by readonly reference, so even large structs are never copied.</summary>
    public delegate void GameEventHandler<T>(in T evt) where T : struct, IGameEvent;

    /// <summary>
    /// Type-safe, allocation-free publish/subscribe bus.
    ///
    /// Why it looks like this (mobile performance):
    /// - One static class per event type: dispatch is a direct array walk. No
    ///   Dictionary&lt;Type, ...&gt; lookup and no boxing, since events are structs passed by `in`.
    /// - Raising allocates nothing: no LINQ, no closures, no defensive list copies.
    ///   Garbage-free gameplay frames matter on mobile, where a GC spike on a
    ///   mid-range Android phone can cost 5-15 ms (a dropped frame at 60 FPS).
    /// - Re-entrancy safe: handlers may Subscribe/Unsubscribe (even themselves) or
    ///   raise other events while a dispatch is in flight. Removals during dispatch
    ///   are tombstoned (nulled) and compacted once the outermost dispatch finishes.
    /// - One throwing handler cannot break the others: exceptions are logged and
    ///   dispatch continues. That isolation matters when monetization code listens
    ///   to gameplay events.
    ///
    /// Main thread only. Subscribe in OnEnable and unsubscribe in OnDisable.
    /// </summary>
    public static class EventBus<T> where T : struct, IGameEvent
    {
        private static GameEventHandler<T>[] s_handlers = new GameEventHandler<T>[8];
        private static int s_count;
        private static int s_dispatchDepth;
        private static bool s_needsCompaction;

        static EventBus()
        {
            StaticReset.Register(Clear);
        }

        public static int HandlerCount
        {
            get
            {
                int live = 0;
                for (int i = 0; i < s_count; i++) if (s_handlers[i] != null) live++;
                return live;
            }
        }

        public static void Subscribe(GameEventHandler<T> handler)
        {
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            if (IndexOf(handler) >= 0) return; // idempotent: double OnEnable must not double-deliver

            if (s_count == s_handlers.Length)
            {
                Array.Resize(ref s_handlers, s_handlers.Length * 2);
            }
            // Handlers added mid-dispatch land past the dispatch's captured count,
            // so they first receive the *next* raise. That is the least surprising rule.
            s_handlers[s_count++] = handler;
        }

        public static void Unsubscribe(GameEventHandler<T> handler)
        {
            if (handler == null) return;
            int index = IndexOf(handler);
            if (index < 0) return;

            if (s_dispatchDepth > 0)
            {
                s_handlers[index] = null; // tombstone; compacted after dispatch
                s_needsCompaction = true;
                return;
            }

            RemoveAtPreservingOrder(index);
        }

        public static void Raise(in T evt)
        {
            int count = s_count; // capture: late subscribers wait for the next raise
            if (count == 0) return;

            s_dispatchDepth++;
            try
            {
                for (int i = 0; i < count; i++)
                {
                    GameEventHandler<T> handler = s_handlers[i];
                    if (handler == null) continue;
                    try
                    {
                        handler(in evt);
                    }
                    catch (Exception e)
                    {
                        Debug.LogException(e);
                    }
                }
            }
            finally
            {
                s_dispatchDepth--;
                if (s_dispatchDepth == 0 && s_needsCompaction) Compact();
            }
        }

        /// <summary>Removes every handler. Used on domain-reload-less play mode entry and in tests.</summary>
        public static void Clear()
        {
            Array.Clear(s_handlers, 0, s_handlers.Length);
            if (s_dispatchDepth > 0)
            {
                s_needsCompaction = true; // the in-flight dispatch skips the nulls, then compacts to empty
                return;
            }
            s_count = 0;
            s_needsCompaction = false;
        }

        private static int IndexOf(GameEventHandler<T> handler)
        {
            for (int i = 0; i < s_count; i++)
            {
                // Delegate equality compares target + method, so a fresh method-group
                // conversion of the same instance method still matches.
                if (s_handlers[i] != null && s_handlers[i].Equals(handler)) return i;
            }
            return -1;
        }

        private static void RemoveAtPreservingOrder(int index)
        {
            s_count--;
            if (index < s_count)
            {
                Array.Copy(s_handlers, index + 1, s_handlers, index, s_count - index);
            }
            s_handlers[s_count] = null;
        }

        private static void Compact()
        {
            int write = 0;
            for (int read = 0; read < s_count; read++)
            {
                if (s_handlers[read] == null) continue;
                s_handlers[write++] = s_handlers[read];
            }
            for (int i = write; i < s_count; i++) s_handlers[i] = null;
            s_count = write;
            s_needsCompaction = false;
        }
    }
}
