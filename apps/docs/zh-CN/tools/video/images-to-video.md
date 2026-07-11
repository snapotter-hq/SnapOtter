---
description: "将一组图像制作成幻灯片视频。"
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 19a2be9d6a78
---

# Images to Video {#images-to-video}

将一组图像制作成幻灯片视频，并可配置每张图像的显示时长、分辨率和帧率。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

接受包含两个或更多图像文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | 每张图像的显示时长，单位为秒（0.5-10） |
| resolution | string | No | `"720p"` | 输出分辨率：`1080p`、`720p`、`square` |
| fps | integer | No | `30` | 输出帧率（10-60） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- 每次请求接受 2-60 个图像文件。图像按上传顺序出现在视频中。
- 图像会被缩放并填充以适应目标分辨率，同时保持宽高比。
- `square` 分辨率选项会生成 1080x1080 的视频，适用于社交媒体。
- 输出格式始终为 MP4（H.264）。
