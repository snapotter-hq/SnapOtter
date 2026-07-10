---
description: "将视频中的字幕轨道提取为 SRT 文件。"
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 53e76c0a839c
---

# Extract Subtitles {#extract-subtitles}

从视频容器中提取内嵌的字幕轨道，并将其下载为 SRT 文件。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

接受包含视频文件的 multipart 表单数据。此工具没有可配置的设置。

## Parameters {#parameters}

此工具没有参数。它会提取视频容器中找到的第一个字幕轨道。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- 视频必须包含内嵌的字幕轨道。如果未找到字幕轨道，请求将返回 400 错误。
- 如果视频包含多个字幕轨道，则提取第一个。
- 无论容器中原始字幕格式如何，输出格式均为 SRT。
