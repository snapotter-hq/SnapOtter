---
description: "Удаление фона на основе ИИ с опциональными эффектами (размытие, тень, градиент, пользовательский фон)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 5c0b9077e60b
---

# Удаление фона {#remove-background}

Удаление фона на основе ИИ с опциональными эффектами (размытие, тень, градиент, пользовательский фон).

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `background-removal` (4-5 ГБ)

## Параметры {#parameters}

Этап 1 удаляет фон и кеширует прозрачную PNG-маску и исходное изображение. Замена фона, размытие, падающая тень и преобразование формата вывода применяются на [этапе 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (или при запуске `remove-background` как шага конвейера или пакетного задания); передача этих полей на этап 1 возвращает 400.

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| model | string | Нет | - | Вариант ИИ-модели для использования |
| edgeRefine | integer | Нет | - | Уровень уточнения краёв (0-3) |
| decontaminate | boolean | Нет | - | Удалить цветовые затёки по краям |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
| backgroundImage | file | Требуется, когда `backgroundType` равен `image` | - | Пользовательское фоновое изображение |

#### Поля JSON настроек {#settings-json-fields}

| Поле | Тип | Обязательный | По умолчанию | Описание |
|-------|------|----------|---------|-------------|
| jobId | string | Да | - | ID задания из этапа 1 |
| filename | string | Да | - | Исходное имя файла из этапа 1 |
| backgroundType | string | Нет | `"transparent"` | Одно из: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Требуется, когда `backgroundType` равен `color` | - | Hex-цвет: `#RRGGBB` или `#RGB` (`#` необязателен) |
| gradientColor1 | string | Требуется, когда `backgroundType` равен `gradient` | - | Первый цвет градиента, hex как в `backgroundColor` |
| gradientColor2 | string | Требуется, когда `backgroundType` равен `gradient` | - | Второй цвет градиента, hex как в `backgroundColor` |
| gradientAngle | number | Нет | - | Угол градиента в градусах |
| blurEnabled | boolean | Нет | - | Размыть исходный фон за объектом (`backgroundType: "blur"` подразумевает это) |
| blurIntensity | number | Нет | - | Интенсивность размытия (0-100) |
| shadowEnabled | boolean | Нет | - | Включить падающую тень на объект |
| shadowOpacity | number | Нет | `35` | Непрозрачность тени (0-100), используется, когда `shadowEnabled` равно true |
| outputFormat | string | Нет | `"png"` | Формат вывода: `png`, `webp` или `avif` |

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

#### Ошибка: удаление фона истекло (410) {#error-background-removal-expired-410}

Эндпоинт effects работает с маской и оригиналом, которые этап 1 сохранил для `jobId`. Сохранённые результаты со временем очищаются, поэтому если между двумя вызовами пройдёт слишком много времени, они исчезнут. Снова запустите этап 1 с тем же изображением и используйте `jobId`, который он вернёт.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

`jobId` или `filename`, которые не могут обозначать сохранённый файл (разделитель пути, `..`, пустая строка), получают ответ 400.

## Примечания {#notes}

- Требует установленного пакета модели `background-removal` (4-5 ГБ).
- Этап 1 кеширует прозрачную маску и исходное изображение, чтобы этап 2 (эффекты) мог мгновенно повторно применять разные фоны без повторного запуска ИИ-модели.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
- Поворот по EXIF автоматически корректируется перед обработкой.
