---
description: "Генератор фото на паспорт и удостоверение на основе ИИ с распознаванием лица, удалением фона и раскладкой для печатного листа."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 09fd7c582d79
---

# Фото на паспорт {#passport-photo}

Генератор фото на паспорт и удостоверение на основе ИИ. Двухэтапный процесс: анализ (распознавание лица + удаление фона), затем генерация (кадрирование, изменение размера и раскладка для печати).

## Эндпоинты API {#api-endpoints}

Этот инструмент использует двухэтапный процесс с отдельными эндпоинтами для анализа и генерации.

**Пакеты моделей:** `background-removal` и `face-detection`

---

### Этап 1: Анализ {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Определяет ориентиры лица и удаляет фон. Возвращает данные об ориентирах и предпросмотр, чтобы фронтенд мог показать предпросмотр кадрирования.

#### Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| clientJobId | string | Нет | - | Опциональный ID задания для отслеживания прогресса через SSE |

#### Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Ответ (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Прогресс (SSE, опционально) {#progress-sse-optional}

Если указан `clientJobId`, прогресс транслируется (0-30% для распознавания лица, 30-95% для удаления фона).

#### Ошибка: Лицо не обнаружено (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Этап 2: Генерация {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Кадрирует, изменяет размер и опционально раскладывает фото на печатном листе. Использует кешированные изображения из этапа 1 (без повторного запуска ИИ).

#### Параметры (JSON-тело) {#parameters-json-body}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| jobId | string | Да | - | ID задания из этапа 1 |
| filename | string | Да | - | Исходное имя файла из этапа 1 |
| countryCode | string | Да | - | Код страны для спецификации паспорта (например, `US`, `GB`, `IN`) |
| documentType | string | Нет | `"passport"` | Тип документа (из спецификации страны) |
| bgColor | string | Нет | `"#FFFFFF"` | Цвет фона в hex |
| printLayout | string | Нет | `"none"` | Раскладка листа для печати: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Нет | `0` | Ограничение максимального размера файла в КБ (0 = без ограничения) |
| dpi | number | Нет | `300` | Выходной DPI (72-1200) |
| customWidthMm | number | Нет | - | Пользовательская ширина фото в мм (переопределяет спецификацию страны) |
| customHeightMm | number | Нет | - | Пользовательская высота фото в мм (переопределяет спецификацию страны) |
| zoom | number | Нет | `1` | Коэффициент масштабирования (0.5-3). Значения > 1 кадрируют плотнее |
| adjustX | number | Нет | `0` | Корректировка положения по горизонтали |
| adjustY | number | Нет | `0` | Корректировка положения по вертикали |
| landmarks | object | Да | - | Объект ориентиров из ответа этапа 1 |
| imageWidth | number | Да | - | Ширина изображения из ответа этапа 1 |
| imageHeight | number | Да | - | Высота изображения из ответа этапа 1 |

#### Пример запроса {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Ответ (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Базовый маршрут {#base-route}

`POST /api/v1/tools/image/passport-photo`

Возвращает указание использовать правильный подэндпоинт.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Примечания {#notes}

- Требует установленных пакетов моделей `background-removal` и `face-detection`.
- На этапе 1 выполняется ИИ (ориентиры лица + удаление фона) и кешируются результаты. Этап 2 — это чистая обработка изображений через Sharp (быстро, без ИИ).
- Ориентиры возвращаются как нормализованные координаты (диапазон 0-1 относительно размеров изображения).
- Поле `preview` в ответе анализа — это PNG в формате base64 (максимум 800px в ширину) для быстрого отображения.
- Спецификации стран включают размеры документа, соотношения высоты головы и позиционирование линии глаз на основе официальных требований к фото на паспорт.
- Опция `printLayout` генерирует раскладку на бумаге 4x6\" или A4 с промежутками в 2 мм между фото.
- Когда задан `maxFileSizeKb`, вывод итеративно сжимается, чтобы уложиться в ограничение размера.
