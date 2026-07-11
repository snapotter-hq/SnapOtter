---
description: "Постоянное встраивание субтитров в кадры видео."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 63ddf5163da3
---

# Burn Subtitles {#burn-subtitles}

Постоянное встраивание (жёсткое кодирование) субтитров из файла SRT, VTT или ASS в каждый кадр видео.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Принимает multipart form data с файлом видео и файлом субтитров. Это асинхронная конечная точка: она сразу возвращает `202 Accepted`, а прогресс передаётся через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Размер шрифта субтитров в пикселях (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Загрузите два файла: первым должно быть видео, вторым - файл субтитров (.srt, .vtt или .ass).
- Встроенные субтитры становятся постоянной частью видео, и зритель не может их отключить. Для переключаемых субтитров используйте вместо этого инструмент Embed Subtitles.
- Обновления прогресса доступны через SSE по адресу `GET /api/v1/jobs/{jobId}/progress` до завершения задания.
