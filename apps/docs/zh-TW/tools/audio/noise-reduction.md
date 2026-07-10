---
description: "以 FFT 為基礎的降噪來減少音訊的背景雜訊。"
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: b48fa6dd7ac4
---

# 降噪 {#noise-reduction}

以 FFT 為基礎的降噪、搭配可選強度來減少音訊檔案中的背景雜訊。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | string | No | `"medium"` | 降噪強度：`light`、`medium`、`strong` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light` 保留較多細節但去除較少雜訊。`strong` 去除較多雜訊但可能引入細微的假影。
- 對背景雜訊一致的錄音（風扇嗡嗡聲、空調、靜電雜訊）效果最佳。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而僅能解碼但不受支援的輸入會退回 MP3。
