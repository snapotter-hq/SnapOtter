---
description: "為音訊加入淡入與淡出效果。"
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 5677aad0cd3d
---

# 淡化音訊 {#fade-audio}

在音訊檔案的開頭與結尾加入淡入與淡出效果。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | 淡入時長（秒）（0 至 30） |
| fadeOutS | number | No | `1` | 淡出時長（秒）（0 至 30） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- 將任一值設為 `0` 即可略過該淡化方向。至少要有一個大於 0。
- 若淡化時長超過音訊長度，會被夾限至音訊長度。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而僅能解碼但不受支援的輸入會退回 MP3。
