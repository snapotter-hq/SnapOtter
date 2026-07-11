---
description: "從音訊檔案中移除靜音區段。"
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: e29f249c4708
---

# 靜音移除 {#silence-removal}

根據可設定的門檻值與最短持續時間，偵測並移除音訊檔案中的靜音區段。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

接受包含一個音訊檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | 以 dB 為單位的靜音門檻值（-80 至 -20）。低於此音量的音訊會被視為靜音。 |
| minSilenceS | number | No | `0.5` | 要移除的最短靜音持續時間（秒），範圍 0.1 至 5 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- 較高（較不負）的門檻值更為積極，會連同較安靜的段落一併移除，而不只是真正的靜音。
- 提高 `minSilenceS` 可只移除較長的停頓，同時保留較短的自然間隔。
- 適合用於清理 Podcast 錄音、講座與語音備忘錄。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而不支援的僅可解碼輸入則會退回為 MP3。
