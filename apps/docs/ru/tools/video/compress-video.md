---
description: "Уменьшение размера файла видео с контролем качества."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 5be560415f7c
---

# Compress Video {#compress-video}

Уменьшение размера файла видео с помощью настраиваемой степени сжатия и необязательного понижения разрешения.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Принимает multipart form data с файлом видео и полем JSON `settings`. Это асинхронная конечная точка: она сразу возвращает `202 Accepted`, а прогресс передаётся через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Степень сжатия: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Выходное разрешение: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Пресет `light` сохраняет качество, близкое к исходному. Пресет `strong` агрессивно уменьшает размер файла за счёт визуальной точности.
- Понижение разрешения (например, с 4K до 720p) в сочетании со сжатием даёт значительное сокращение размера.
- Обновления прогресса доступны через SSE по адресу `GET /api/v1/jobs/{jobId}/progress` до завершения задания.
