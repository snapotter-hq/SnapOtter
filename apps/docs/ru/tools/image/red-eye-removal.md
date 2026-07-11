---
description: "Обнаружение и коррекция эффекта красных глаз, вызванного вспышкой камеры, на основе ИИ."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 74f64d016e5b
---

# Удаление красных глаз {#red-eye-removal}

Обнаружение и коррекция эффекта красных глаз, вызванного вспышкой камеры, на основе ИИ.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `face-detection` (200-300 МБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| sensitivity | number | Нет | `50` | Чувствительность обнаружения красных глаз (0-100). Более высокие значения обнаруживают более слабый эффект красных глаз |
| strength | number | Нет | `70` | Сила коррекции (0-100). Насколько агрессивно нейтрализовать красный цвет |
| format | string | Нет | - | Выходной формат (опциональное переопределение) |
| quality | number | Нет | `90` | Качество вывода (1-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
```

## Ответ {#response}

### Первоначальный ответ (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогресс (SSE на `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Примечания {#notes}

- Требует установленного пакета модели `face-detection` (200-300 МБ).
- Сначала обнаруживает лица, затем находит области глаз в каждом лице и, наконец, определяет и корректирует пиксели красных глаз.
- Счётчик `facesDetected` указывает, сколько лиц было найдено; `eyesCorrected` — это общее количество отдельных глаз, у которых был скорректирован эффект красных глаз.
- Вывод всегда PNG для максимального сохранения качества.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
