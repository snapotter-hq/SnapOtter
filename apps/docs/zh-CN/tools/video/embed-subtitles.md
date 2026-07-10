---
description: "将字幕轨道复用（mux）进视频容器。"
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 9d1245067173
---

# Embed Subtitles {#embed-subtitles}

将字幕文件复用（mux）进视频容器，作为观看者可自行开启或关闭的软字幕轨道。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

接受包含视频文件、字幕文件以及 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | ISO 639-2/B 语言代码（3 个小写字母，例如 `"eng"`、`"fra"`、`"deu"`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- 上传两个文件：第一个必须是视频，第二个必须是字幕文件（.srt、.vtt 或 .ass）。
- 内嵌的（软）字幕可由观看者在其媒体播放器中切换。若需要永久可见的字幕，请改用 Burn Subtitles 工具。
- 语言代码以元数据形式存储在容器中，有助于媒体播放器为字幕轨道标注标签。
