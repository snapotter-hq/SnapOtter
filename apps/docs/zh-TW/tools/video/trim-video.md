---
description: "透過指定開始和結束時間，從影片中剪出一個片段。"
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 52b49fa2d4b6
---

# Trim Video {#trim-video}

透過以秒為單位指定開始和結束時間，從影片中剪出一個片段，並可選擇進行影格精準的剪輯。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 開始時間（以秒為單位，必須 >= 0） |
| endS | number | Yes | - | 結束時間（以秒為單位，必須晚於 startS） |
| precise | boolean | No | `false` | 重新編碼以進行影格精準剪輯，而非關鍵影格尋找 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- 當 `precise` 為 `false`（預設值）時，工具會使用關鍵影格尋找，速度快但可能在要求的時間點之前幾個影格就開始。
- 將 `precise` 設為 `true` 會重新編碼該段落以取得精確的影格邊界，但需要更長時間。
- `endS` 值必須大於 `startS`。
