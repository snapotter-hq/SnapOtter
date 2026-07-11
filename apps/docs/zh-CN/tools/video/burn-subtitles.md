---
description: "将字幕永久渲染到视频画面上。"
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 55fe2195ffc4
---

# Burn Subtitles {#burn-subtitles}

将 SRT、VTT 或 ASS 文件中的字幕永久渲染（硬编码）到视频的每一帧画面上。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

接受包含视频文件和字幕文件的 multipart 表单数据。这是一个异步端点：它会立即返回 `202 Accepted`，进度通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处流式传输。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | 字幕字号，单位为像素（8-72） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 上传两个文件：第一个必须是视频，第二个必须是字幕文件（.srt、.vtt 或 .ass）。
- 烧录的字幕会永久成为视频的一部分，观看者无法关闭。若需要可切换的字幕，请改用 Embed Subtitles 工具。
- 在任务完成前，可通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 处获取进度更新。
