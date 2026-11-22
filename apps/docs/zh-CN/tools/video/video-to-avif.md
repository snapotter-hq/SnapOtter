---
description: "将视频片段转换为动画 AVIF 图像。"
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: a6b760727c00
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

将视频片段转换为动画 AVIF 图像，可配置帧率、宽度、质量和片段范围。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 输出帧率（1-30） |
| width | integer | No | `480` | 输出宽度，单位为像素（64-1280）。高度按比例缩放 |
| startS | number | No | `0` | 片段起始位置，单位为秒 |
| durationS | number | No | `5` | 片段时长，单位为秒（最长 60） |
| quality | integer | No | `50` | AVIF 质量（1-100） |
| loop | boolean | No | `true` | 循环播放动画 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1 编码比 GIF 或 WebP 慢，因此该工具通常返回 `202` 和一个任务，可通过 SSE 在 `/api/v1/jobs/{jobId}/progress` 跟踪进度。较短的片段可能在同步等待时间内完成并直接返回结果：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- 动画 AVIF 免版税，在相同视觉质量下通常比动画 WebP 或 GIF 更小。
- 当前浏览器均可播放动画 AVIF。部分桌面图片查看器只显示第一帧。
- 音轨会被移除。
