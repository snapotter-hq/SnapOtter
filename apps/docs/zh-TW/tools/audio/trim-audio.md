---
description: "透過指定開始與結束時間，從音訊檔案中裁切出一段。"
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: aebd901f3133
---

# 裁切音訊 {#trim-audio}

透過以秒為單位指定開始與結束時間，從音訊檔案中裁切出一段。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

接受包含一個音訊檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 開始時間（秒）（最小值 0） |
| endS | number | Yes | - | 結束時間（秒）（必須在開始時間之後） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- 時間以秒為單位指定，並可包含小數（例如 `10.5`）。
- `endS` 值必須大於 `startS`。
- 若 `endS` 超過音訊長度，檔案會裁切至結尾。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而不支援的僅可解碼輸入則會退回為 MP3。
