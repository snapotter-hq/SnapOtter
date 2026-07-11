---
description: "倒放视频片段。"
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 5ab5e17aa139
---

# Reverse Video {#reverse-video}

倒放视频片段。音轨也会被反转。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

接受包含视频文件的 multipart 表单数据。此工具没有可配置的设置。

## Parameters {#parameters}

此工具没有参数。它会反转整个视频。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- 限制为最长 5 分钟的片段。较长的视频会被拒绝并返回 400 错误。
- 视频轨道和音轨都会被反转。若要在不含音频的情况下反转视频，请先将其静音。
