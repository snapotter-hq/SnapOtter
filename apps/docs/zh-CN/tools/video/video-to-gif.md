---
description: "将视频片段转换为动画 GIF。"
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 1f4d73d93ecc
---

# Video to GIF {#video-to-gif}

将视频片段转换为动画 GIF，并可配置帧率、宽度、起始时间和时长。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。这是一个异步端点：它会立即返回 `202 Accepted`，进度通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处流式传输。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 输出帧率（1-30） |
| width | integer | No | `480` | 输出宽度，单位为像素（64-1280）。高度按比例缩放 |
| startS | number | No | `0` | 起始时间，单位为秒（必须 >= 0） |
| durationS | number | No | `5` | 时长，单位为秒（大于 0，最大 60） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 较低的 `fps` 和 `width` 值会生成更小的 GIF 文件。480px 宽、12 fps 的 GIF 通常是不错的平衡。
- 最长时长为 60 秒。更长的片段会生成非常大的文件。
- 在任务完成前，可通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处获取进度更新。
