---
description: "从音频文件中删除静音片段。"
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 23718306c561
---

# Silence Removal {#silence-removal}

根据可配置的阈值和最小时长，检测并删除音频文件中的静音片段。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

接受包含音频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | 静音阈值（单位 dB，-80 到 -20）。低于此电平的音频被视为静音。 |
| minSilenceS | number | No | `0.5` | 需要删除的最小静音时长（单位秒，0.1 到 5） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- 阈值越高（负值越小）越激进，会连同较安静的段落和真正的静音一起删除。
- 增大 `minSilenceS` 可只删除较长的停顿，同时保留短暂的自然间隙。
- 适合清理播客录音、讲座和语音备忘录。
- 输出通常保留输入容器格式。AAC 输入会写成 M4A，不受支持的仅解码输入会回退为 MP3。
