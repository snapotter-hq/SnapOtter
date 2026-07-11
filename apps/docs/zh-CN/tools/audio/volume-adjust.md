---
description: "按固定的分贝增益增大或减小音频音量。"
i18n_source_hash: b9bc1de2c9ef
i18n_provenance: human
i18n_output_hash: da87d398b6f3
---

# Volume Adjust {#volume-adjust}

通过施加固定的分贝增益来增大或减小音频文件的音量。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

接受包含音频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | 音量调整量（单位分贝，-30 到 30） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- 正值增大音量，负值减小音量。
- 较大的正增益可能导致削波。可使用 normalize-audio 进行响度安全的电平调整。
- 输出通常保留输入容器格式。AAC 输入会写成 M4A，不受支持的仅解码输入会回退为 MP3。
