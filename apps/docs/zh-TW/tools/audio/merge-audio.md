---
description: "將多個音訊檔案合併成一個連續音軌。"
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 7bfd8bb1cd69
---

# 合併音訊 {#merge-audio}

將兩個以上的音訊檔案合併成單一連續音軌，依上傳順序串接。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

接受包含多個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 輸出格式：`mp3`、`wav`、`flac`、`m4a` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## 附註 {#notes}

- 每次請求接受 2 至 10 個音訊檔案。
- 檔案依上傳順序串接。
- 所有輸入檔案都會重新編碼為所選的輸出格式與取樣率，以達成無縫接合。
- 支援混用輸入格式（例如一個 WAV 加一個 MP3）。
