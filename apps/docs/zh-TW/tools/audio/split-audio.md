---
description: "依時間區間、等份或靜音偵測分割音訊。"
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: d403cc905b48
---

# 分割音訊 {#split-audio}

依固定時間區間、等份或自動靜音偵測，將音訊檔案分割成多個片段。回傳一個包含所有片段的 ZIP 壓縮檔。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

接受包含一個音訊檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | 分割策略：`time`、`parts`、`silence` |
| segmentS | number | No | `60` | 片段長度（秒），1 至 3600（當 mode 為 `time` 時使用） |
| parts | integer | No | `2` | 等份數量，2 至 20（當 mode 為 `parts` 時使用） |
| thresholdDb | number | No | `-40` | 以 dB 為單位的靜音門檻值，-80 至 -20（當 mode 為 `silence` 時使用） |
| minSilenceS | number | No | `0.3` | 最短靜音間隔（秒），0.1 至 10（當 mode 為 `silence` 時使用） |

## Example Request {#example-request}

分割成 30 秒的片段：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

以靜音偵測分割：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` 會指向一個包含所有片段的 ZIP 壓縮檔。
- 只會使用與所選 `mode` 相關的參數，其餘會被忽略。
- 片段檔名會依序編號（例如 `part-000.mp3`、`part-001.mp3`）。
- 輸出格式與輸入格式相同。
