---
description: "按时间间隔、等份或静音检测分割音频。"
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 3fd40ad03990
---

# Split Audio {#split-audio}

按固定时间间隔、等份或自动静音检测将音频文件分割为多个片段。返回包含这些片段的 ZIP 压缩包。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

接受包含音频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | 分割策略：`time`、`parts`、`silence` |
| segmentS | number | No | `60` | 每段长度（单位秒，1 到 3600，mode 为 `time` 时使用） |
| parts | integer | No | `2` | 等份数量，2 到 20（mode 为 `parts` 时使用） |
| thresholdDb | number | No | `-40` | 静音阈值（单位 dB，-80 到 -20，mode 为 `silence` 时使用） |
| minSilenceS | number | No | `0.3` | 最小静音间隙（单位秒，0.1 到 10，mode 为 `silence` 时使用） |

## Example Request {#example-request}

分割为 30 秒的片段：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

按静音检测分割：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` 指向包含所有片段的 ZIP 压缩包。
- 只使用与所选 `mode` 相关的参数，其他参数会被忽略。
- 片段文件名按顺序编号（例如 `part-000.mp3`、`part-001.mp3`）。
- 输出格式与输入格式一致。
