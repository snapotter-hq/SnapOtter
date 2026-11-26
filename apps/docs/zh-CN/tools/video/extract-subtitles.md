---
description: "从视频中提取字幕轨道，保存为 SRT、WebVTT 或 ASS 文件。"
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: d83f08459c68
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

从视频容器中提取内嵌的字幕轨道，并将其下载为 SRT、WebVTT 或 ASS 文件。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

接受包含视频文件和可选 `settings` JSON 字符串的 multipart 表单数据。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | 输出格式：`srt`、`vtt`（WebVTT）或 `ass` |

提取视频容器中找到的第一个字幕轨道。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- 视频必须包含内嵌的字幕轨道。如果未找到字幕轨道，请求将返回 400 错误。
- 如果视频包含多个字幕轨道，则提取第一个。
- 文本字幕轨道（SubRip、ASS、mov_text、WebVTT）可以转换为三种输出格式中的任意一种。将 ASS 轨道转换为 SRT 或 WebVTT 会丢失其定位和特效。
- 基于图像的字幕轨道（蓝光 PGS、DVD VobSub）不经 OCR 无法转换为文本，会返回 422 错误。
