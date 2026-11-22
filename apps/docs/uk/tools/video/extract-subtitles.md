---
description: "Витягує доріжку субтитрів із відео як файл SRT, WebVTT або ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 59af3583f950
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Витягує вбудовану доріжку субтитрів із відеоконтейнера й завантажує її як файл SRT, WebVTT або ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Приймає дані форми multipart із відеофайлом і необов'язковим JSON-рядком `settings`.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Вихідний формат: `srt`, `vtt` (WebVTT) або `ass` |

Витягується перша доріжка субтитрів, знайдена у відеоконтейнері.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Відео має містити вбудовану доріжку субтитрів. Якщо доріжку субтитрів не знайдено, запит повертає помилку 400.
- Якщо відео має кілька доріжок субтитрів, витягується перша.
- Текстові доріжки (SubRip, ASS, mov_text, WebVTT) конвертуються в будь-який із трьох вихідних форматів. Під час конвертації доріжки ASS у SRT або WebVTT втрачаються її позиціонування й ефекти.
- Доріжки на основі зображень (Blu-ray PGS, DVD VobSub) не можна перетворити на текст без OCR, тому для них повертається помилка 422.
