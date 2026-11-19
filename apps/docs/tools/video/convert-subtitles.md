---
description: Convert subtitle files between SRT, WebVTT and ASS.
---

# Convert Subtitles {#convert-subtitles}

Convert a subtitle file between SRT, WebVTT and ASS. Timing and text carry over; ASS positioning and effects don't.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Accepts multipart form data with one subtitle file (`.srt`, `.vtt` or `.ass`) and an optional JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Output format: `srt`, `vtt` or `ass` |
| `encoding` | string | `"auto"` | Text encoding of the input: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` or `euc-kr` |

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

- Converting from ASS keeps the timing, the dialogue text and basic formatting the target can hold: SRT keeps italics, bold, colour and font size as tags, WebVTT keeps italics, bold and underline. On-screen positioning, animation and other ASS effects are dropped.
- The output is always UTF-8. With `encoding` set to `auto`, a file that is valid UTF-8 is read as is and anything else is read as Windows-1252, the usual encoding for older Western European SRT files. If accented or non-Latin characters come out garbled, set `encoding` to the file's real encoding (for example `gb18030` for Simplified Chinese or `windows-1251` for Cyrillic).
- Subtitle uploads are capped at 1 MB by default. Raise or remove the cap with `MAX_SUBTITLE_SIZE_MB`.
