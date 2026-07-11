---
description: "通过指定开始和结束时间从音频文件中裁剪出一段。"
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 3c8a6fca1ac4
---

# Trim Audio {#trim-audio}

通过以秒为单位指定开始和结束时间，从音频文件中裁剪出一段。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

接受包含音频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 开始时间（单位秒，最小为 0） |
| endS | number | Yes | - | 结束时间（单位秒，必须晚于开始时间） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- 时间以秒为单位指定，可以包含小数（例如 `10.5`）。
- `endS` 值必须大于 `startS`。
- 如果 `endS` 超过音频时长，文件会裁剪到结尾。
- 输出通常保留输入容器格式。AAC 输入会写成 M4A，不受支持的仅解码输入会回退为 MP3。
