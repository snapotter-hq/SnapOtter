---
description: "使用 AI 驱动的转写将语音转换为文本。"
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 85e9922f3b8c
---

# Transcribe Audio {#transcribe-audio}

使用 AI 驱动的转写（faster-whisper）将语音转换为文本。支持纯文本、SRT 和 VTT 输出格式，并可自动或手动选择语言。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

接受包含音频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | 语言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| outputFormat | string | No | `"txt"` | 输出格式：`txt`、`srt`、`vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

这是一个异步工具。API 会立即返回 `202 Accepted`：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

通过 `GET /api/v1/jobs/{jobId}/progress` 处的 SSE 跟踪进度。作业完成后，SSE 流会传递带有 `downloadUrl` 的最终结果。

## Notes {#notes}

- 需要安装 **transcription** 功能包。如果该功能包不可用，会返回 `501`，其代码为 `FEATURE_NOT_INSTALLED`，并包含缺失的 `feature`、`featureName` 和 `estimatedSize`。
- 使用 faster-whisper 进行转写。语言设为 `auto` 时会自动检测所说的语言。
- `srt` 和 `vtt` 格式为每个片段包含时间戳，适合用作字幕。
- `txt` 格式返回不带时间戳的纯文本。
- 这是一个长时间运行的 AI 工具，处理时间取决于音频长度和服务器硬件。
