---
description: "Объединение нескольких видеоклипов в один файл."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: caf3ff1f8c76
---

# Merge Videos {#merge-videos}

Объединение нескольких видеоклипов в один файл MP4. Все входные файлы приводятся к разрешению первого видео и 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Принимает multipart form data с двумя или более файлами видео. Это асинхронная конечная точка: она сразу возвращает `202 Accepted`, а прогресс передаётся через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

У этого инструмента нет параметров настройки. Загрузите от 2 до 10 файлов видео в виде нескольких частей `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Клипы объединяются в том порядке, в котором они загружены.
- Все клипы перекодируются под разрешение, частоту кадров (30 fps) и кодек (H.264) первого клипа. Несоответствующие входные файлы автоматически приводятся к единому виду.
- Принимает от 2 до 10 файлов видео за запрос.
- Обновления прогресса доступны через SSE по адресу `GET /api/v1/jobs/{jobId}/progress` до завершения задания.
