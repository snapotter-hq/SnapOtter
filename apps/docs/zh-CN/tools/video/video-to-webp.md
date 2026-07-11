---
description: "将视频片段转换为动画 WebP 图像。"
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 94fe44796987
---

# Video to WebP {#video-to-webp}

将视频片段转换为动画 WebP 图像，并可配置帧率、宽度和质量。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 输出帧率（1-30） |
| width | integer | No | `480` | 输出宽度，单位为像素（16-1920）。高度按比例缩放 |
| quality | integer | No | `75` | WebP 压缩质量（1-100） |
| loop | boolean | No | `true` | 循环播放动画 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 动画 WebP 生成的文件比 GIF 更小，且色彩支持更好（24 位对比 8 位调色板）。
- 较低的 `quality` 值会以牺牲视觉保真度为代价生成更小的文件。
- 对于应播放一次即停止的动画，将 `loop` 设置为 `false`。
