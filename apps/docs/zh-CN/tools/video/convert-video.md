---
description: "在 MP4、MOV、WebM、AVI 和 MKV 之间转换视频。"
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 67bec3789b19
---

# Convert Video {#convert-video}

在 MP4、MOV、WebM、AVI 和 MKV 格式之间转换视频，并可配置质量预设。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。这是一个异步端点：它会立即返回 `202 Accepted`，进度通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处流式传输。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | 输出格式：`mp4`、`mov`、`webm`、`avi`、`mkv` |
| quality | string | No | `"balanced"` | 质量预设：`high`、`balanced`、`small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `high` 质量预设可获得最佳视觉保真度，但文件较大。`small` 预设会激进压缩以获得最小文件大小。
- WebM 输出使用 VP9 编码。MP4 和 MOV 使用 H.264。AVI 和 MKV 可用于传统或归档工作流。
- 在任务完成前，可通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处获取进度更新。
