---
description: "Виправляйте подряпини, розриви та пошкодження на старих фотографіях за допомогою конвеєра ШІ для реставрації, покращення обличчя та кольору."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 045026bff6bc
---

# Реставрація фото {#photo-restoration}

Виправляйте подряпини, розриви та пошкодження на старих фотографіях за допомогою багатоетапного конвеєра ШІ. Поєднує виправлення подряпин, покращення обличчя, шумозаглушення та опціональне розфарбовування.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Пакет моделі:** `photo-restoration` (4-5 ГБ)

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| scratchRemoval | boolean | Ні | `true` | Видалити подряпини та поверхневі пошкодження |
| faceEnhancement | boolean | Ні | `true` | Покращити обличчя на відреставрованому фото |
| fidelity | number | Ні | `0.7` | Точність покращення обличчя (0-1). Вищі значення більше зберігають оригінальні риси |
| denoise | boolean | Ні | `true` | Застосувати шумозаглушення до відреставрованого результату |
| denoiseStrength | number | Ні | `25` | Сила шумозаглушення (0-100) |
| colorize | boolean | Ні | `false` | Розфарбувати відреставроване фото (для чорно-білих зображень) |
| colorizeStrength | number | Ні | `85` | Інтенсивність розфарбовування (0-100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Примітки {#notes}

- Потребує встановлення пакета моделі `photo-restoration` (4-5 ГБ).
- Конвеєр запускає кілька етапів ШІ послідовно: виправлення подряпин, покращення обличчя (GFPGAN), шумозаглушення та за бажанням розфарбовування.
- Масив `steps` у результаті показує, які етапи обробки були фактично виконані.
- `scratchCoverage` - це орієнтовний відсоток площі зображення, що мала пошкодження від подряпин.
- `fidelity` контролює, наскільки сильно покращуються обличчя проти збереження оригінального вигляду. Нижчі значення дають агресивніше покращення; вищі значення більш консервативні.
- Опція `colorize` автоматично визначає, чи є зображення чорно-білим. Прапорець `isGrayscale` у результаті підтверджує це виявлення.
- Вихідний формат автоматично збігається з вхідним.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR, HDR та AVIF через автоматичне декодування.
