---
description: "加快或放慢视频速度。"
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: dbdc2ed96092
---

# Video Speed {#video-speed}

加快或放慢视频速度，并可选择保留音频音调。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | 速度倍数（0.25-4）。大于 1 加速，小于 1 减速 |
| keepPitch | boolean | No | `true` | 改变速度时保留音频音调 |

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

- `2` 的倍数会使播放速度加倍（时长减半）。`0.5` 的倍数会使播放速度减半（时长加倍）。
- 当 `keepPitch` 为 `true` 时，音频会被时间拉伸，使人声听起来自然。当为 `false` 时，音调会随速度成比例变化。
- 有效范围为 0.25x 到 4x。
