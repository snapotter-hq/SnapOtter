---
description: "从视频中剥离元数据并报告发现的内容。"
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: c93ff604aaa7
---

# Clean Video Metadata {#clean-video-metadata}

从视频中剥离元数据（创建日期、GPS 坐标、相机型号、软件标记等）并报告已移除的内容。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

接受包含视频文件的 multipart 表单数据。此工具没有可配置的设置。

## Parameters {#parameters}

此工具没有参数。它会从视频容器中剥离所有元数据。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- 被剥离的元数据包括创建时间戳、GPS/位置数据、相机/设备信息和软件标记。
- 视频流和音频流会被直接复制而不重新编码，因此没有质量损失。
- 在公开分享视频前有助于保护隐私。
