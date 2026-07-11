---
description: "将动画 GIF 转换为 MP4、WebM 或 MOV 视频。"
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 6ca9b1d058c3
---

# GIF to Video {#gif-to-video}

将动画 GIF 转换为紧凑的 MP4、WebM 或 MOV 视频文件。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

接受包含 GIF 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | 输出格式：`mp4`、`webm`、`mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- 将 GIF 转换为视频通常可在保持相同视觉质量的同时将文件大小减小 80-90%。
- 仅接受动画 GIF 文件。静态图像应使用图像 Convert 工具。
- MP4 和 MOV 使用 H.264 编码，WebM 使用 VP9。
