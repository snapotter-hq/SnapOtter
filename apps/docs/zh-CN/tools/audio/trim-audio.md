---
description: "通过指定开始和结束时间从音频文件中裁剪出一段。"
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: af32b83bcb98
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

从音频文件中裁剪出一段。可以保留开始和结束时间之间的部分，也可以从开头和结尾各裁掉固定的时长。

在应用中，时间字段可以填纯秒数（`90`）、`MM:SS`（`1:30`）或 `HH:MM:SS`（`1:02:03.5`）。API 使用秒数。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

接受包含音频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` 保留从 `startS` 到 `endS` 的部分。`ends` 从开头移除 `cutStartS`，从结尾移除 `cutEndS` |
| startS | number | No | `0` | 范围模式：开始时间（单位秒，最小为 0） |
| endS | number | Range mode | - | 范围模式：结束时间（单位秒，必须晚于开始时间） |
| cutStartS | number | No | `0` | 两端模式：从开头移除的秒数 |
| cutEndS | number | No | `0` | 两端模式：从结尾移除的秒数 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

无论文件多长，都裁掉前 2 秒和后 3 秒：

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
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
- 在范围模式下，`endS` 必须大于 `startS`。如果 `endS` 超过音频时长，文件会裁剪到结尾。
- 在两端模式下，`cutStartS` 和 `cutEndS` 至少有一个必须大于零，且两者合计后必须至少保留 0.1 秒的音频。由于裁剪量是按每个文件自身的长度计算的，同一组设置可以用于一批时长不同的文件。
- 输出通常保留输入容器格式。AAC 输入会写成 M4A，不受支持的仅解码输入会回退为 MP3。
