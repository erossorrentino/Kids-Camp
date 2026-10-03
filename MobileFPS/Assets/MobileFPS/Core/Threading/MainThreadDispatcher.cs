using System;
using System.Collections.Concurrent;
using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Marshals callbacks from SDK threads (ads, billing, notifications, sockets)
    /// back onto Unity's main thread. Third-party mobile SDKs often invoke
    /// callbacks on Java/Obj-C threads; touching any UnityEngine API there crashes or
    /// corrupts state on device while appearing fine in the Editor.
    /// </summary>
    [AutoCreateSingleton]
    [DefaultExecutionOrder(-1000)]
    public sealed class MainThreadDispatcher : Singleton<MainThreadDispatcher>
    {
        private static readonly ConcurrentQueue<Action> s_queue = new ConcurrentQueue<Action>();
        private static int s_mainThreadId = -1;

        static MainThreadDispatcher()
        {
            StaticReset.Register(() => { while (s_queue.TryDequeue(out _)) { } });
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void CaptureMainThread()
        {
            s_mainThreadId = System.Threading.Thread.CurrentThread.ManagedThreadId;
        }

        public static bool IsMainThread => System.Threading.Thread.CurrentThread.ManagedThreadId == s_mainThreadId;

        /// <summary>
        /// Runs <paramref name="action"/> on the main thread: immediately if already
        /// there, otherwise on the next Update. The instance must already exist (it is
        /// created on first access from the main thread; <see cref="Warmup"/> does that early).
        /// </summary>
        public static void Run(Action action)
        {
            if (action == null) return;
            if (IsMainThread)
            {
                action();
                return;
            }
            s_queue.Enqueue(action);
        }

        /// <summary>Always defers to the next Update, even from the main thread (escapes SDK call stacks).</summary>
        public static void Enqueue(Action action)
        {
            if (action != null) s_queue.Enqueue(action);
        }

        /// <summary>Call once from the main thread during boot so the dispatcher exists before any SDK thread needs it.</summary>
        public static void Warmup()
        {
            _ = Instance;
        }

        private void Update()
        {
            // Bounded drain: a burst of callbacks can't stall a single frame forever.
            int budget = 64;
            while (budget-- > 0 && s_queue.TryDequeue(out Action action))
            {
                try { action(); }
                catch (Exception e) { Debug.LogException(e); }
            }
        }
    }
}
