---
description: "将视频中的帧提取为图像 ZIP 包。"
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 940e8089bda5
---

# Video to Frames {#video-to-frames}

从视频中提取单独的帧，并将其下载为包含 PNG 或 JPG 图像的 ZIP 归档。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | 提取模式：`all`、`nth`、`timestamps` |
| n | integer | No | `10` | 每隔第 N 帧提取一次（2-1000）。仅当 mode 为 `"nth"` 时使用 |
| timestamps | string | No | `""` | 以逗号分隔的时间戳，单位为秒。当 mode 为 `"timestamps"` 时必填 |
| format | string | No | `"png"` | 提取帧的图像格式：`png`、`jpg` |

## Example Request {#example-request}

每隔第 30 帧提取一次，格式为 JPG：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

在特定时间戳处提取帧：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- `all` 模式会提取每一帧，对于长视频可能生成非常大的 ZIP 文件。请使用 `nth` 或 `timestamps` 模式进行选择性提取。
- PNG 保留完整质量，但生成的文件较大。JPG 更小，但为有损格式。
- 响应会下载为包含按顺序编号的图像文件的 ZIP 归档。
