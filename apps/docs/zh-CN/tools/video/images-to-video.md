---
description: "将一组图像制作成幻灯片视频、动画 GIF 或动画 WebP。"
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 74f808f207e3
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

将一组图像制作成幻灯片视频，并可配置每张图像的显示时长、分辨率和帧率；也可以制作成动画 GIF 或 WebP，并设置每帧的时长和循环次数。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

接受包含两个或更多图像文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | 输出格式：`mp4`、`gif`、`webp` |
| secondsPerImage | number | No | `2` | 仅 MP4。每张图像的显示时长，单位为秒（0.5-10） |
| resolution | string | No | `"720p"` | 仅 MP4。输出分辨率：`1080p`、`720p`、`square` |
| fps | integer | No | `30` | 仅 MP4。输出帧率（10-60） |
| frameDelayMs | integer | No | `500` | 仅 GIF 和 WebP。每张图像的显示时间，单位为毫秒（20-10000） |
| loop | integer | No | `0` | 仅 GIF 和 WebP。动画播放的次数；`0` 表示无限循环（0-100） |

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

制作每张图像显示 200 毫秒的动画 GIF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- 对于 MP4，图像会被缩放并填充以适应目标分辨率，同时保持宽高比。
- `square` 分辨率选项会生成 1080x1080 的视频，适用于社交媒体。
- MP4 输出为 H.264，文件名为 `slideshow.mp4`。
- GIF 和 WebP 输出使用第一张图像的尺寸。其他尺寸的图像会被缩放到能放入该尺寸内，剩余区域为透明。文件名为 `slideshow.gif` 或 `slideshow.webp`。
- GIF 以百分之一秒为单位存储帧时间，因此 `frameDelayMs` 在 GIF 中会四舍五入到最接近的 10 毫秒。WebP 保留精确值。
- 过大的动画会被拒绝而不是生成：帧尺寸乘以图像数量必须低于 GIF 工具使用的同一像素上限。
