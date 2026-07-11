---
description: "Уменьшение дрожания камеры с помощью двухпроходной стабилизации."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 8c05acb9c49e
---

# Stabilize Video {#stabilize-video}

Уменьшение дрожания камеры в съёмке с рук с помощью двухпроходной стабилизации vidstab из FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Принимает multipart form data с файлом видео и полем JSON `settings`. Это асинхронная конечная точка: она сразу возвращает `202 Accepted`, а прогресс передаётся через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Размер окна сглаживания в кадрах (5-60). Более высокие значения дают более плавное движение |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Стабилизация - это двухпроходный процесс: первый проход анализирует движение камеры, а второй применяет коррекцию. Это занимает примерно вдвое больше времени, чем однопроходные инструменты.
- Более высокие значения сглаживания убирают больше дрожания, но могут привести к небольшому кадрированию (обрезке краёв).
- Обновления прогресса доступны через SSE по адресу `GET /api/v1/jobs/{jobId}/progress` до завершения задания.
