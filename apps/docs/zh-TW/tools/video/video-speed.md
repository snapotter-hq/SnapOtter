---
description: "加速或減慢影片速度。"
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: c4997a201c13
---

# Video Speed {#video-speed}

加速或減慢影片速度，並可選擇保留音訊音高。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | 速度倍率（0.25-4）。大於 1 的值加速，小於 1 的值減慢 |
| keepPitch | boolean | No | `true` | 變更速度時保留音訊音高 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- 倍率 `2` 會使播放速度加倍（時長減半）。倍率 `0.5` 會使播放速度減半（時長加倍）。
- 當 `keepPitch` 為 `true` 時，音訊會進行時間伸縮，讓聲音聽起來自然。當為 `false` 時，音高會隨速度按比例變化。
- 有效範圍為 0.25x 到 4x。
