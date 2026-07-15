---
description: "Автоматическое обнаружение и размытие лиц на изображениях с помощью AI-распознавания лиц для конфиденциальности и анонимизации в соответствии с GDPR."
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: 529decc9bc42
---

# Размытие лиц и ПД {#face-pii-blur}

Автоматически обнаруживайте и размывайте лица на изображениях с помощью распознавания лиц на основе AI (MediaPipe).

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `face-detection` (200–300 МБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| blurRadius | number | Нет | `30` | Радиус размытия, применяемый к обнаруженным лицам (1–100) |
| sensitivity | number | Нет | `0.5` | Чувствительность распознавания лиц (0–1). Более низкие значения обнаруживают меньше лиц с более высокой достоверностью |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
```

## Ответ {#response}

### Первоначальный ответ (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогресс (SSE по адресу `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Лица не обнаружены {#no-faces-detected}

Если лица не найдены, результат включает предупреждение:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Примечания {#notes}

- Требует установки пакета модели `face-detection` (200–300 МБ).
- Выходной формат автоматически совпадает с форматом ввода.
- Массив `faces` содержит координаты ограничивающей рамки (x, y, ширина, высота) для каждого обнаруженного лица.
- Увеличьте `sensitivity` (ближе к 1.0), чтобы обнаруживать больше лиц, включая частично закрытые.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
