---
description: "反轉音訊檔案使其倒著播放。"
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 6b5eb416d48d
---

# 反轉音訊 {#reverse-audio}

反轉音訊檔案使其倒著播放。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

此工具沒有可設定的參數。整個音訊檔案都會被反轉。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## 附註 {#notes}

- 完整的音軌會從尾端反轉到開頭。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而僅能解碼但不受支援的輸入會退回 MP3。
