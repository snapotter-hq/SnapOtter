---
description: "通过质量控制减小视频文件大小。"
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 361abadd94fa
---

# Compress Video {#compress-video}

使用可配置的压缩强度和可选的分辨率降采样来减小视频文件大小。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。这是一个异步端点：它会立即返回 `202 Accepted`，进度通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处流式传输。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | 压缩强度：`light`、`balanced`、`strong` |
| resolution | string | No | `"original"` | 输出分辨率：`original`、`1080p`、`720p`、`480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `light` 预设可保留接近原始的质量。`strong` 预设以牺牲视觉保真度为代价，激进地减小文件大小。
- 降低分辨率（例如从 4K 降到 720p）与压缩叠加，可显著减小文件大小。
- 在任务完成前，可通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处获取进度更新。
