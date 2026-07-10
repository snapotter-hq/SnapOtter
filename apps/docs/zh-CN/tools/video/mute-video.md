---
description: "从视频中移除音轨。"
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: bd8745f68463
---

# Mute Video {#mute-video}

从视频中移除音轨，仅保留视觉流。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

接受包含视频文件的 multipart 表单数据。此工具没有可配置的设置。

## Parameters {#parameters}

此工具没有参数。它会从上传的视频中剥离音轨。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- 视频流会被直接复制而不重新编码，因此没有质量损失。
- 如果输入视频没有音轨，文件将原样返回。
