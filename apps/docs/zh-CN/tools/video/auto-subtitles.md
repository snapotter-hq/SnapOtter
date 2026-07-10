---
description: "使用 AI 从视频音轨生成字幕文件。"
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 7487846234fe
---

# Auto Subtitles {#auto-subtitles}

使用 AI 驱动的语音识别（faster-whisper）从视频的音轨生成字幕文件。支持自动检测和 10 种显式指定的语言。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

接受包含一个视频文件和一个 JSON `settings` 字段的 multipart 表单数据。这是一个异步端点，它会立即返回 `202 Accepted`，进度通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 流式传输。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | 语音语言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| format | string | No | `"srt"` | 输出字幕格式：`srt`、`vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 这是一个 AI 工具，需要安装 **transcription** 功能包。如果未安装该功能包，API 将返回 `501 Feature Not Installed`，并附带通过管理界面安装它的说明。
- `auto` 语言选项使用 whisper 内置的语言检测。显式指定语言可提高准确性和速度。
- SRT 是支持最广泛的字幕格式。VTT（WebVTT）是网页视频播放器的标准格式。
- 在作业完成之前，可通过 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 获取进度更新。
