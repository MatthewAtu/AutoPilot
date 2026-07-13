using AutoPilot.DTOs;
using System.Text.Json;

namespace AutoPilot.Service
{
    public class TriageDraftStore
    {
        private static readonly SemaphoreSlim _lock = new(1, 1);
        private readonly string _filePath;

        public TriageDraftStore(IWebHostEnvironment env)
        {
            var dataDir = Path.Combine(env.ContentRootPath, "Data");
            Directory.CreateDirectory(dataDir);
            _filePath = Path.Combine(dataDir, "triage-draft-store.json");
        }

        public async Task<TriageDraftStoreData> LoadAsync()
        {
            await _lock.WaitAsync();
            try
            {
                if (!File.Exists(_filePath)) return new TriageDraftStoreData();

                var json = await File.ReadAllTextAsync(_filePath);
                if (string.IsNullOrWhiteSpace(json)) return new TriageDraftStoreData();

                return JsonSerializer.Deserialize<TriageDraftStoreData>(json,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new TriageDraftStoreData();
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task SaveAsync(TriageDraftStoreData data)
        {
            await _lock.WaitAsync();
            try
            {
                var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                await File.WriteAllTextAsync(_filePath, json);
            }
            finally
            {
                _lock.Release();
            }
        }
    }
}
