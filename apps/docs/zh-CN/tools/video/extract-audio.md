---
description: "从视频中提取音轨。"
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 9529adf6332c
---

# Extract Audio {#extract-audio}

从视频文件中提取音轨，并保存为 MP3、WAV、M4A 或 OGG。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 输出音频格式：`mp3`、`wav`、`m4a`、`ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- 如果视频没有音轨，请求将返回 400 错误。
- MP3 是有损格式，但兼容性广泛。WAV 是无损格式，但体积大。M4A（AAC）在质量与大小之间取得良好平衡。OGG 可用于开放编解码器工作流。
- 当源音频已是 AAC 且输出格式为 M4A 时，音频流会被直接复制而不重新编码。
