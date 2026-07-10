---
description: "Виявлення та корекція ефекту червоних очей, спричиненого спалахом камери, на основі ШІ."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 7200eace6961
---

# Видалення червоних очей {#red-eye-removal}

Виявлення та корекція ефекту червоних очей, спричиненого спалахом камери, на основі ШІ.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Пакет моделі:** `face-detection` (200-300 МБ)

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| sensitivity | number | Ні | `50` | Чутливість виявлення червоних очей (0-100). Вищі значення виявляють більш тонкий ефект червоних очей |
| strength | number | Ні | `70` | Сила корекції (0-100). Наскільки агресивно нейтралізувати червоний |
| format | string | Ні | - | Вихідний формат (опціональне перевизначення) |
| quality | number | Ні | `90` | Вихідна якість (1-100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
```

## Відповідь {#response}

### Початкова відповідь (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогрес (SSE на `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

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

## Примітки {#notes}

- Потребує встановлення пакета моделі `face-detection` (200-300 МБ).
- Спочатку виявляє обличчя, потім знаходить області очей у межах кожного обличчя і нарешті визначає та коригує пікселі червоних очей.
- Лічильник `facesDetected` вказує, скільки облич було знайдено; `eyesCorrected` - це загальна кількість окремих очей, для яких було виправлено ефект червоних очей.
- Вихідне зображення завжди у форматі PNG для максимального збереження якості.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
