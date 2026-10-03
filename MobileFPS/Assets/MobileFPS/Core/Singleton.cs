using System;
using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>
    /// Marks a <see cref="Singleton{T}"/> that may create itself on first access when
    /// no instance exists in the scene. Leave it off for services that need
    /// Inspector-assigned config (they should be placed in the boot scene instead).
    /// </summary>
    [AttributeUsage(AttributeTargets.Class, Inherited = false)]
    public sealed class AutoCreateSingletonAttribute : Attribute { }

    /// <summary>
    /// MonoBehaviour singleton for app-lifetime services (ads, store, pools, meta).
    ///
    /// Rules that keep this pattern safe in production:
    /// - Derived classes must not declare Awake/OnDestroy/OnApplicationQuit (Unity
    ///   would call the derived method and silently skip this base logic); override
    ///   <see cref="OnSingletonAwake"/> / <see cref="OnSingletonDestroy"/> /
    ///   <see cref="OnSingletonApplicationQuit"/> instead.
    /// - Duplicates (e.g. a service placed in several scenes) self-destruct.
    /// - Never resurrected during application quit, which otherwise leaks objects into
    ///   the Editor scene and logs "Some objects were not cleaned up".
    /// - Access <see cref="Instance"/> once and cache it in hot paths; the lookup is
    ///   cheap but the Unity null-check (lifetime check through native code) is not free.
    /// </summary>
    public abstract class Singleton<T> : MonoBehaviour where T : Singleton<T>
    {
        private static T s_instance;
        private static bool s_isQuitting;
        private static readonly bool s_autoCreate = typeof(T).IsDefined(typeof(AutoCreateSingletonAttribute), false);

        static Singleton()
        {
            StaticReset.Register(() =>
            {
                s_instance = null;
                s_isQuitting = false;
            });
        }

        /// <summary>The live instance, or null when none exists (and auto-create is off or the app is quitting).</summary>
        public static T Instance
        {
            get
            {
                if (s_instance != null) return s_instance;
                if (s_isQuitting) return null;

                s_instance = FindFirstObjectByType<T>();
                if (s_instance == null && s_autoCreate)
                {
                    var go = new GameObject($"[{typeof(T).Name}]");
                    s_instance = go.AddComponent<T>(); // Awake runs synchronously inside AddComponent
                }
                return s_instance;
            }
        }

        /// <summary>True when an instance exists, without triggering a scene search or auto-creation.</summary>
        public static bool HasInstance => s_instance != null;

        /// <summary>Override to false for scene-scoped singletons (e.g. a match controller).</summary>
        protected virtual bool PersistAcrossScenes => true;

        protected void Awake()
        {
            if (s_instance != null && s_instance != this)
            {
                Destroy(gameObject);
                return;
            }

            s_instance = (T)this;
            if (PersistAcrossScenes)
            {
                // DontDestroyOnLoad only works on root objects.
                if (transform.parent != null) transform.SetParent(null, false);
                DontDestroyOnLoad(gameObject);
            }
            OnSingletonAwake();
        }

        protected void OnDestroy()
        {
            if (s_instance != this) return;
            OnSingletonDestroy();
            s_instance = null;
        }

        protected void OnApplicationQuit()
        {
            s_isQuitting = true;
            OnSingletonApplicationQuit();
        }

        protected virtual void OnSingletonAwake() { }
        protected virtual void OnSingletonDestroy() { }
        protected virtual void OnSingletonApplicationQuit() { }
    }
}
