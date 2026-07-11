using AutoPilot.DTOs;
using System.Text.Json;

namespace AutoPilot.Service
{
    public class HealthMonitorStore
    {
        private static readonly SemaphoreSlim _lock = new(1, 1);
        private readonly string _filePath;

        public HealthMonitorStore(IWebHostEnvironment env)
        {
            var dataDir = Path.Combine(env.ContentRootPath, "Data");
            Directory.CreateDirectory(dataDir);
            _filePath = Path.Combine(dataDir, "health-monitor-store.json");
        }

        public async Task<HealthMonitorStoreData> LoadAsync()
        {
            await _lock.WaitAsync();
            try
            {
                if (!File.Exists(_filePath)) return new HealthMonitorStoreData();

                var json = await File.ReadAllTextAsync(_filePath);
                if (string.IsNullOrWhiteSpace(json)) return new HealthMonitorStoreData();

                return JsonSerializer.Deserialize<HealthMonitorStoreData>(json,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new HealthMonitorStoreData();
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task SaveAsync(HealthMonitorStoreData data)
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
