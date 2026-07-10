---
description: "将视频音频音量归一化到广播标准。"
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: 3523e302d9c6
---

# Normalize Audio {#normalize-audio}

将视频音频音量归一化到 EBU R128 广播响度标准。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

接受包含视频文件的 multipart 表单数据。此工具没有可配置的设置。

## Parameters {#parameters}

此工具没有参数。它会对音轨应用 EBU R128 响度归一化。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- 使用 FFmpeg 的 `loudnorm` 滤镜，目标为 -16 LUFS 综合响度、-1.5 dBTP 真峰值和 11 LU 响度范围（EBU R128 广播标准）。
- 源音频采样率会在输出中保留。
- 如果视频没有音轨，请求将返回 400 错误。
