---
description: "将视频缩放到新的分辨率或预设尺寸。"
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: 686f8a6eaf6c
---

# Resize Video {#resize-video}

使用自定义像素尺寸或标准预设将视频缩放到新的分辨率。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | 目标宽度，单位为像素（16-7680） |
| height | integer | No | - | 目标高度，单位为像素（16-4320） |
| preset | string | No | `"custom"` | 分辨率预设：`custom`、`2160p`、`1440p`、`1080p`、`720p`、`480p`、`360p` |

当 `preset` 为 `"custom"` 时，必须至少提供 `width` 或 `height` 之一。另一个维度会按比例缩放。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

缩放到自定义尺寸：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- 预设值映射到标准高度（例如 `720p` = 1280x720，`1080p` = 1920x1080）。宽度会根据源宽高比按比例缩放。
- 根据大多数视频编解码器的要求，尺寸会被舍入为偶数。
- 支持的最大分辨率为 7680x4320（8K UHD）。
