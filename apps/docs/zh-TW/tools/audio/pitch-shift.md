---
description: "以半音為單位升高或降低音訊音高而不改變速度。"
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: a5f38863f283
---

# 移調 {#pitch-shift}

以若干半音為單位升高或降低音訊檔案的音高，而不改變其播放速度。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| semitones | integer | No | `3` | 要移動的半音數（-12 至 12）。不可為零。 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- 正值升高音高；負值降低音高。
- 移動 12 個半音等於升高一個八度；-12 等於降低一個八度。
- 不論移動量多少，播放時長維持不變。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A，而僅能解碼但不受支援的輸入會退回 MP3。
