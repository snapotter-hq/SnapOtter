---
description: "Удаление фона на основе ИИ с опциональными эффектами (размытие, тень, градиент, пользовательский фон)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: 1ce6edb18b47
---

# Удаление фона {#remove-background}

Удаление фона на основе ИИ с опциональными эффектами (размытие, тень, градиент, пользовательский фон).

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `background-removal` (4-5 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| model | string | Нет | - | Вариант ИИ-модели для использования |
| backgroundType | string | Нет | `"transparent"` | Один из: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Нет | - | Hex-цвет для сплошного фона |
| gradientColor1 | string | Нет | - | Первый цвет градиента |
| gradientColor2 | string | Нет | - | Второй цвет градиента |
| gradientAngle | number | Нет | - | Угол градиента в градусах |
| blurEnabled | boolean | Нет | - | Включить эффект размытия фона |
| blurIntensity | number | Нет | - | Интенсивность размытия (0-100) |
| shadowEnabled | boolean | Нет | - | Включить падающую тень на объект |
| shadowOpacity | number | Нет | - | Непрозрачность тени (0-100) |
| outputFormat | string | Нет | - | Выходной формат: `png`, `webp` или `avif` |
| edgeRefine | integer | Нет | - | Уровень уточнения краёв (0-3) |
| decontaminate | boolean | Нет | - | Удалить цветовые затёки по краям |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Эндпоинт эффектов (Этап 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Повторно применяет эффекты фона без повторного запуска ИИ-модели. Использует кешированную маску и оригинал из этапа 1.

### Параметры {#parameters-1}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| settings | JSON | Да | - | JSON с настройками эффектов (см. ниже) |
| backgroundImage | file | Нет | - | Пользовательское фоновое изображение (когда backgroundType равен `image`) |

#### Поля JSON настроек {#settings-json-fields}

| Поле | Тип | Обязательный | Описание |
|-------|------|----------|-------------|
| jobId | string | Да | ID задания из этапа 1 |
| filename | string | Да | Исходное имя файла из этапа 1 |
| backgroundType | string | Нет | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Нет | Hex-цвет для сплошного фона |
| gradientColor1 | string | Нет | Первый цвет градиента |
| gradientColor2 | string | Нет | Второй цвет градиента |
| gradientAngle | number | Нет | Угол градиента в градусах |
| blurEnabled | boolean | Нет | Включить размытие фона |
| blurIntensity | number | Нет | Интенсивность размытия (0-100) |
| shadowEnabled | boolean | Нет | Включить падающую тень |
| shadowOpacity | number | Нет | Непрозрачность тени (0-100) |
| outputFormat | string | Нет | `png`, `webp` или `avif` |

### Пример запроса {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Ответ (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Примечания {#notes}

- Требует установленного пакета модели `background-removal` (4-5 ГБ).
- Этап 1 кеширует прозрачную маску и исходное изображение, чтобы этап 2 (эффекты) мог мгновенно повторно применять разные фоны без повторного запуска ИИ-модели.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
- Поворот по EXIF автоматически корректируется перед обработкой.
