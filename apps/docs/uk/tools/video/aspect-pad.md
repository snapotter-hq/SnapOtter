---
description: "Додавання суцільнокольорових смуг для відповідності цільовому співвідношенню сторін."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 71994d39b099
---

# Aspect Pad {#aspect-pad}

Додавайте суцільнокольорові смуги (леттербокс або пілларбокс), щоб вписати відео в цільове співвідношення сторін без обрізання.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Приймає багаточастинні (multipart) дані форми з відеофайлом та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | Цільове співвідношення сторін: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | Шістнадцятковий колір для смуг заповнення (наприклад `"#000000"` для чорного) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Якщо відео вже відповідає цільовому співвідношенню сторін, файл повертається без змін.
- Використовуйте `9:16` для вертикальних/портретних форматів соціальних мереж (TikTok, Reels, Shorts).
- Для розмитого заповнення замість суцільного кольору використовуйте інструмент Blur Pad.
