---
description: "以固定的分貝增益增加或降低音訊音量。"
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: dcf6dce7f3b9
---

# 調整音量 {#volume-adjust}

透過套用固定的分貝增益，增加或降低音訊檔案的音量。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

接受包含一個音訊檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | 以分貝為單位的音量調整（-30 至 30） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- 正值會增加音量；負值會降低音量。
- 較大的正增益可能造成削波。請使用 normalize-audio 進行不損音量的響度平衡。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而不支援的僅可解碼輸入則會退回為 MP3。
