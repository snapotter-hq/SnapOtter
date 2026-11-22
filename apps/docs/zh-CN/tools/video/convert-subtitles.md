---
description: "在 SRT、WebVTT 和 ASS 之间转换字幕文件。"
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 2578450e6eab
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

在 SRT、WebVTT 和 ASS 之间转换字幕文件。时间轴和文本会保留，但 ASS 的定位和特效不会保留。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

接受包含一个字幕文件（`.srt`、`.vtt` 或 `.ass`）和可选 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | 输出格式：`srt`、`vtt` 或 `ass` |
| `encoding` | string | `"auto"` | 输入的文本编码：`auto`、`utf-8`、`windows-1252`、`windows-1250`、`windows-1251`、`windows-1256`、`iso-8859-2`、`gb18030`、`big5`、`shift_jis` 或 `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- 从 ASS 转换时，会保留时间轴、对白文本以及目标格式能够承载的基本格式：SRT 以标签形式保留斜体、粗体、颜色和字号，WebVTT 保留斜体、粗体和下划线。屏幕定位、动画及其他 ASS 特效会被丢弃。
- 输出始终为 UTF-8。当 `encoding` 设为 `auto` 时，有效的 UTF-8 文件按原样读取，其他文件则按 Windows-1252 读取（旧式西欧 SRT 文件常用的编码）。如果带重音符号或非拉丁字符显示为乱码，请将 `encoding` 设为文件的实际编码（例如简体中文用 `gb18030`，西里尔文用 `windows-1251`）。
- 字幕上传默认上限为 1 MB。可通过 `MAX_SUBTITLE_SIZE_MB` 提高或取消该上限。
