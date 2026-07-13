using AutoPilot.DTOs;
using System.Text.Json;

namespace AutoPilot.Service
{
    public class DailyTaskListStore
    {
        private static readonly SemaphoreSlim _lock = new(1, 1);
        private readonly string _filePath;

        public DailyTaskListStore(IWebHostEnvironment env)
        {
            var dataDir = Path.Combine(env.ContentRootPath, "Data");
            Directory.CreateDirectory(dataDir);
            _filePath = Path.Combine(dataDir, "daily-tasklist-store.json");
        }

        public async Task<DailyTaskListData> LoadAsync()
        {
            await _lock.WaitAsync();
            try
            {
                if (!File.Exists(_filePath)) return new DailyTaskListData();

                var json = await File.ReadAllTextAsync(_filePath);
                if (string.IsNullOrWhiteSpace(json)) return new DailyTaskListData();

                return JsonSerializer.Deserialize<DailyTaskListData>(json,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new DailyTaskListData();
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task SaveAsync(DailyTaskListData data)
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
