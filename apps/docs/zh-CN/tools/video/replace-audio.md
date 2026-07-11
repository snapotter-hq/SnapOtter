---
description: "用另一个文件替换视频的音轨。"
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: a37f3fa77f2b
---

# Replace Audio {#replace-audio}

用音频文件替换视频的音轨。同时上传一个视频和一个音频文件。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

接受恰好包含两个文件的 multipart 表单数据：先是视频文件，然后是音频文件。

## Parameters {#parameters}

此工具没有设置参数。上传一个视频文件和一个音频文件，作为两个 `file` 部分。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- 必须恰好上传两个文件：第一个必须是视频，第二个必须是音频文件。
- 如果音频文件比视频长，它会被裁剪以匹配视频时长。如果较短，视频剩余部分将静音播放。
- 视频流会被直接复制而不重新编码，因此没有视频质量损失。
