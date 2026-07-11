---
description: "Автоматичне виявлення та розмиття облич на зображеннях за допомогою ШІ-виявлення облич для конфіденційності та GDPR-сумісної анонімізації."
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: bd07b81e5727
---

# Розмиття облич / PII {#face-pii-blur}

Автоматичне виявлення та розмиття облич на зображеннях за допомогою виявлення облич на основі ШІ (MediaPipe).

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` щодо статусу через SSE)

**Пакет моделі:** `face-detection` (200-300 МБ)

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| blurRadius | number | Ні | `30` | Радіус розмиття, застосований до виявлених облич (1-100) |
| sensitivity | number | Ні | `0.5` | Чутливість виявлення облич (0-1). Нижчі значення виявляють менше облич з вищою впевненістю |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
```

## Відповідь {#response}

### Початкова відповідь (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Перебіг (SSE за адресою `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

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

### Обличчя не виявлено {#no-faces-detected}

Якщо обличчя не знайдено, результат містить попередження:

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

## Примітки {#notes}

- Потребує встановлення пакета моделі `face-detection` (200-300 МБ).
- Вихідний формат автоматично відповідає вхідному.
- Масив `faces` містить координати обмежувальної рамки (x, y, ширина, висота) для кожного виявленого обличчя.
- Збільшіть `sensitivity` (ближче до 1.0), щоб виявити більше облич, зокрема частково закриті.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
