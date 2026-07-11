---
description: "通过双通道稳定处理减少画面抖动。"
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 546a198fbb78
---

# Stabilize Video {#stabilize-video}

使用 FFmpeg 的双通道 vidstab 稳定处理来减少手持拍摄画面中的抖动。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。这是一个异步端点：它会立即返回 `202 Accepted`，进度通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处流式传输。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | 平滑窗口大小，单位为帧（5-60）。数值越高，运动越平滑 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 稳定处理是双通道过程：第一通道分析画面运动，第二通道应用校正。这大约需要单通道工具两倍的时间。
- 更高的平滑值可去除更多抖动，但可能在边缘引入轻微的缩放裁切。
- 在任务完成前，可通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处获取进度更新。
