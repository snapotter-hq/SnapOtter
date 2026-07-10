---
description: "将文本水印烧录到视频画面上。"
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: f1708b74c3f6
---

# Watermark Video {#watermark-video}

将文本水印烧录到视频的每一帧画面上，并可配置位置、大小、不透明度和颜色。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 水印文本（1-200 个字符） |
| position | string | No | `"br"` | 画面上的位置：`tl`、`tc`、`tr`、`l`、`c`、`r`、`bl`、`bc`、`br` |
| fontSize | integer | No | `36` | 字号，单位为像素（8-120） |
| opacity | number | No | `0.5` | 水印不透明度（0.05-1） |
| color | string | No | `"#ffffff"` | 文本的十六进制颜色（例如 `"#ffffff"`） |

### Position Values {#position-values}

- **tl** - 左上，**tc** - 顶部居中，**tr** - 右上
- **l** - 左中，**c** - 居中，**r** - 右中
- **bl** - 左下，**bc** - 底部居中，**br** - 右下

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 水印会永久渲染进视频画面，处理后无法移除。
- 水印使用 FFmpeg 内置的无衬线字体。
- 对于图像水印，请改用图像 Watermark 工具。
