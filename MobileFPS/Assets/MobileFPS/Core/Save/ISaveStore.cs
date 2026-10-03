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
}
