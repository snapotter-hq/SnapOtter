---
description: "Конвертация видео между форматами MP4, MOV, WebM, AVI и MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 86d7e1ad1de3
---

# Convert Video {#convert-video}

Конвертация видео между форматами MP4, MOV, WebM, AVI и MKV с настраиваемыми пресетами качества.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Принимает multipart form data с файлом видео и полем JSON `settings`. Это асинхронная конечная точка: она сразу возвращает `202 Accepted`, а прогресс передаётся через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Выходной формат: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Пресет качества: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Пресет качества `high` обеспечивает лучшую визуальную точность, но файлы получаются больше. Пресет `small` агрессивно сжимает для минимального размера файла.
- Вывод в WebM использует кодирование VP9. MP4 и MOV используют H.264. AVI и MKV доступны для устаревших или архивных рабочих процессов.
- Обновления прогресса доступны через SSE по адресу `GET /api/v1/jobs/{jobId}/progress` до завершения задания.
