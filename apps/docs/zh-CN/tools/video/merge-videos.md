---
description: "将多个视频片段合并为一个文件。"
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 3ee706e3e2c9
---

# Merge Videos {#merge-videos}

将多个视频片段合并为单个 MP4 文件。所有输入都会归一化为第一个视频的分辨率和 30 fps。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

接受包含两个或更多视频文件的 multipart 表单数据。这是一个异步端点：它会立即返回 `202 Accepted`，进度通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处流式传输。

## Parameters {#parameters}

此工具没有设置参数。上传 2-10 个视频文件作为多个 `file` 部分。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 片段按上传顺序拼接。
- 所有片段都会重新编码以匹配第一个片段的分辨率、帧率（30 fps）和编解码器（H.264）。不匹配的输入会自动归一化。
- 每次请求接受 2-10 个视频文件。
- 在任务完成前，可通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处获取进度更新。
