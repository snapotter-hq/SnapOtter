---
description: "用视频的模糊副本填充条框。"
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 6ecab728c928
---

# Blur Pad {#blur-pad}

通过用视频的模糊、缩放副本填充填充区域（而不是纯色条框），使视频适应目标宽高比。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

接受包含一个视频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | 目标宽高比：`16:9`、`9:16`、`1:1`、`4:3`、`3:4` |
| blur | number | No | `20` | 背景的高斯模糊 sigma（2-50） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- 模糊值越高，背景越柔和、越抽象。值越低，保留的细节越多。
- 如果视频已经匹配目标宽高比，则文件将原样返回。
- 若要使用纯色填充，请改用 Aspect Pad 工具。
