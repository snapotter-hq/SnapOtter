---
description: "檢視、編輯或移除音訊中繼資料標籤（ID3）。"
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: d6159db82b94
---

# 音訊中繼資料 {#audio-metadata}

檢視、編輯或移除音訊中繼資料標籤，例如標題、演出者與專輯（ID3 及類似的標籤格式）。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strip | boolean | No | `false` | 移除所有現有的中繼資料標籤 |
| title | string | No | - | 設定標題標籤（最多 500 個字元） |
| artist | string | No | - | 設定演出者標籤（最多 500 個字元） |
| album | string | No | - | 設定專輯標籤（最多 500 個字元） |

## 範例請求 {#example-request}

編輯中繼資料標籤：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

移除所有中繼資料：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## 附註 {#notes}

- 回應包含一個 `metadata` 物件，內含容器格式、時長、位元率與目前的標籤。
- 當 `strip` 為 `true` 時，所有標籤欄位都會被忽略，且每個現有標籤都會被移除。
- 只有你提供的標籤會被更新；未指定的標籤維持不變。
- 輸出格式與輸入格式相同。
