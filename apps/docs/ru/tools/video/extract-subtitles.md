---
description: "Извлечение дорожки субтитров из видео в виде файла SRT, WebVTT или ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 7b887013093d
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Извлечение встроенной дорожки субтитров из контейнера видео и её загрузка в виде файла SRT, WebVTT или ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Принимает multipart form data с файлом видео и необязательной JSON-строкой `settings`.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Выходной формат: `srt`, `vtt` (WebVTT) или `ass` |

Извлекается первая дорожка субтитров, найденная в контейнере видео.

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

- Видео должно содержать встроенную дорожку субтитров. Если дорожка субтитров не найдена, запрос возвращает ошибку 400.
- Если у видео несколько дорожек субтитров, извлекается первая.
- Текстовые дорожки (SubRip, ASS, mov_text, WebVTT) конвертируются в любой из трёх выходных форматов. При конвертации дорожки ASS в SRT или WebVTT теряются её позиционирование и эффекты.
- Дорожки на основе изображений (Blu-ray PGS, DVD VobSub) нельзя превратить в текст без OCR, для них возвращается ошибка 422.
