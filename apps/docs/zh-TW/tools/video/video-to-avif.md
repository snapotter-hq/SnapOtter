---
description: "將影片片段轉換為動畫 AVIF 圖片。"
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 1ac30b5f5afe
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

將影片片段轉換為動畫 AVIF 圖片，可設定影格率、寬度、品質和片段範圍。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 輸出影格率（1-30） |
| width | integer | No | `480` | 輸出寬度（以像素為單位，64-1280）。高度會按比例縮放 |
| startS | number | No | `0` | 片段起始位置（以秒為單位） |
| durationS | number | No | `5` | 片段長度（以秒為單位，最長 60） |
| quality | integer | No | `50` | AVIF 品質（1-100） |
| loop | boolean | No | `true` | 循環播放動畫 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1 編碼比 GIF 或 WebP 慢，因此這個工具通常會回應 `202` 並附上一個工作，可透過 SSE 在 `/api/v1/jobs/{jobId}/progress` 追蹤進度。較短的片段可能在同步等待時間內完成並直接回傳結果：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- 動畫 AVIF 免權利金，在相同視覺品質下通常比動畫 WebP 或 GIF 更小。
- 目前的瀏覽器都能播放動畫 AVIF。部分桌面圖片檢視器只會顯示第一個影格。
- 音軌會被移除。
