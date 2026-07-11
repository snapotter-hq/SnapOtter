---
description: "用倍率加速或放慢音訊播放。"
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: c02df349a775
---

# 音訊速度 {#audio-speed}

透過套用速度倍率來加速或放慢音訊播放。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `1.5` | 速度倍率（0.25 至 4）。小於 1 會放慢；大於 1 會加速。 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## 附註 {#notes}

- 倍率為 `0.25` 時以四分之一速度播放（時長變 4 倍）。倍率為 `4` 時以四倍速度播放（時長變為 1/4）。
- 速度改變時音高會被保留（時間伸縮）。若要獨立調整音高，請使用 pitch-shift。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而僅能解碼但不受支援的輸入會退回 MP3。
