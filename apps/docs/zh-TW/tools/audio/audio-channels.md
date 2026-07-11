---
description: "在單聲道與立體聲之間轉換，或交換左右聲道。"
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: fc0f08fae5fd
---

# 音訊聲道 {#audio-channels}

在單聲道與立體聲配置之間轉換音訊，或交換立體聲檔案的左右聲道。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Yes | - | 聲道操作：`stereo-to-mono`、`mono-to-stereo`、`swap` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## 附註 {#notes}

- `stereo-to-mono` 會把兩個聲道混成單一單聲道音軌。
- `mono-to-stereo` 會把單聲道複製到左右兩個聲道。
- `swap` 會交換立體聲檔案的左右聲道。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而僅能解碼但不受支援的輸入會退回 MP3。
