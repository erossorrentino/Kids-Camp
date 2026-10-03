using System;
using System.Collections.Concurrent;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;

namespace MobileFPS.Core
{
    /// <summary>Key/value persistence for local data (profile cache, settings).</summary>
    public interface ISaveStore
    {
        bool TryLoad<T>(string key, out T data) where T : class;

        /// <summary>Serialize now (main thread), write on a worker thread. Latest write per key wins.</summary>
        void SaveAsync<T>(string key, T data) where T : class;

        /// <summary>Serialize and write synchronously. Use from OnApplicationPause(true), where Android may kill the process right after.</summary>
        void SaveImmediate<T>(string key, T data) where T : class;

        void Delete(string key);
    }

    /// <summary>
    /// Crash-safe JSON save files under Application.persistentDataPath.
    ///
    /// Mobile-specific choices:
    /// - <b>Atomic replace</b>: write to .tmp, keep the old file as .bak, then
    ///   move. A phone that dies mid-write (battery, OS kill) never leaves a
    ///   truncated save; load falls back to .bak if the main file fails validation.
    /// - <b>Off-main-thread IO</b>: flash storage on low-end Android can stall
    ///   10-50 ms on fsync. Serialization stays on the main thread (cheap, and Unity
    ///   objects aren't thread-safe), and only the byte write moves to the thread pool.
    /// - <b>Tamper seal</b>: an HMAC over the payload stops casual save editing on
    ///   rooted devices. It is deterrence, not security: the key ships in the binary.
    ///   Anything with real-money value (premium currency, purchases) must be
    ///   authoritative on your backend, and this file is only a cache of it.
    /// </summary>
    public sealed class JsonFileSaveStore : ISaveStore
    {
        private const string Extension = ".json";
        private const string Separator = "\n";
        private readonly string _directory;
        private readonly byte[] _hmacKey;
        private readonly object _ioLock = new object();
        private readonly ConcurrentDictionary<string, int> _writeGenerations = new ConcurrentDictionary<string, int>();

        public JsonFileSaveStore(string directory = null, string hmacSecret = "mobilefps-local-seal-v1")
        {
            _directory = directory ?? Path.Combine(Application.persistentDataPath, "saves");
            // Per-install salt instead of SystemInfo.deviceUniqueIdentifier: no hardware
            // identifier is read, which keeps the Play Console Data Safety form simple.
            _hmacKey = Encoding.UTF8.GetBytes(hmacSecret + GetOrCreateInstallSalt());
            Directory.CreateDirectory(_directory);
        }

        public bool TryLoad<T>(string key, out T data) where T : class
        {
            string path = PathFor(key);
            lock (_ioLock)
            {
                if (TryReadValidated(path, out data)) return true;
                if (TryReadValidated(path + ".bak", out data))
                {
                    Debug.LogWarning($"[Save] '{key}' was corrupt or tampered; recovered from backup.");
                    return true;
                }
            }
            data = null;
            return false;
        }

        public void SaveAsync<T>(string key, T data) where T : class
        {
            string payload = Seal(JsonUtility.ToJson(data));
            string path = PathFor(key);
            int generation = BumpGeneration(path);

            Task.Run(() =>
            {
                lock (_ioLock)
                {
                    // A newer save of this key was requested after us: skip the stale
                    // payload (latest-wins) and spare the flash a redundant write.
                    if (_writeGenerations.TryGetValue(path, out int latest) && latest != generation) return;
                    WriteAtomic(path, payload);
                }
            });
        }

        public void SaveImmediate<T>(string key, T data) where T : class
        {
            string payload = Seal(JsonUtility.ToJson(data));
            string path = PathFor(key);
            BumpGeneration(path); // supersede any queued async write of this key
            lock (_ioLock)
            {
                WriteAtomic(path, payload);
            }
        }

        public void Delete(string key)
        {
            string path = PathFor(key);
            lock (_ioLock)
            {
                TryDelete(path);
                TryDelete(path + ".bak");
                TryDelete(path + ".tmp");
            }
        }

        private string PathFor(string key) => Path.Combine(_directory, key + Extension);

        private int BumpGeneration(string path) => _writeGenerations.AddOrUpdate(path, 1, (_, current) => current + 1);

        private static string GetOrCreateInstallSalt()
        {
            const string prefsKey = "mfps.install_salt";
            string salt = PlayerPrefs.GetString(prefsKey, string.Empty);
            if (string.IsNullOrEmpty(salt))
            {
                salt = Guid.NewGuid().ToString("N");
                PlayerPrefs.SetString(prefsKey, salt);
                PlayerPrefs.Save();
            }
            return salt;
        }

        private string Seal(string json)
        {
            return ComputeSeal(json) + Separator + json;
        }

        private string ComputeSeal(string json)
        {
            using (var hmac = new HMACSHA256(_hmacKey))
            {
                byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(json));
                return Convert.ToBase64String(hash);
            }
        }

        private bool TryReadValidated<T>(string path, out T data) where T : class
        {
            data = null;
            try
            {
                if (!File.Exists(path)) return false;
                string content = File.ReadAllText(path, Encoding.UTF8);
                int split = content.IndexOf(Separator, StringComparison.Ordinal);
                if (split <= 0) return false;

                string seal = content.Substring(0, split);
                string json = content.Substring(split + Separator.Length);
                if (!string.Equals(seal, ComputeSeal(json), StringComparison.Ordinal)) return false;

                data = JsonUtility.FromJson<T>(json);
                return data != null;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Save] Failed to read '{path}': {e.Message}");
                return false;
            }
        }

        private static void WriteAtomic(string path, string payload)
        {
            string tmp = path + ".tmp";
            string bak = path + ".bak";
            try
            {
                File.WriteAllText(tmp, payload, Encoding.UTF8);
                if (File.Exists(path))
                {
                    // File.Replace isn't reliably supported on Android filesystems; do it by hand.
                    File.Copy(path, bak, overwrite: true);
                    File.Delete(path);
                }
                File.Move(tmp, path);
            }
            catch (Exception e)
            {
                Debug.LogError($"[Save] Write failed for '{path}': {e}");
            }
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); }
            catch (Exception e) { Debug.LogWarning($"[Save] Could not delete '{path}': {e.Message}"); }
        }
    }
}
