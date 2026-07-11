---
description: "更改视频的帧率。"
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 6b4462cd3b90
---

# Change FPS {#change-fps}

将视频的帧率更改为 1 到 120 fps 之间的目标值。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | 目标帧率（1-120） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- 降低帧率会丢弃帧并减小文件大小。提高帧率会复制帧以填补空缺，但不会增加真实的运动细节。
- 常用目标值：24（电影）、30（网络/广播）、60（流畅播放）。
- 音轨会按其原始采样率保留。
