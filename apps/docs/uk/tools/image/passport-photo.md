---
description: "Генератор фото на паспорт та ID на основі ШІ з виявленням обличчя, видаленням фону та розкладкою для друку."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 5b29b6c57ba1
---

# Фото на паспорт {#passport-photo}

Генератор фото на паспорт та ID на основі ШІ. Двофазний робочий процес: аналіз (виявлення обличчя + видалення фону), потім генерація (обрізка, зміна розміру та розкладка для друку).

## Кінцеві точки API {#api-endpoints}

Цей інструмент використовує двофазний потік з окремими кінцевими точками для аналізу та генерації.

**Пакети моделей:** `background-removal` та `face-detection`

---

### Фаза 1: Аналіз {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Виявляє орієнтири обличчя та видаляє фон. Повертає дані орієнтирів і попередній перегляд, щоб фронтенд відобразив попередній перегляд обрізки.

#### Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| clientJobId | string | Ні | - | Опціональний ID завдання для відстеження прогресу через SSE |

#### Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Відповідь (200 OK) {#response-200-ok}

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

#### Прогрес (SSE, опціонально) {#progress-sse-optional}

Якщо вказано `clientJobId`, прогрес передається потоком (0-30% для виявлення обличчя, 30-95% для видалення фону).

#### Помилка: Обличчя не виявлено (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Фаза 2: Генерація {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Обрізає, змінює розмір та за бажанням розкладає фото на аркуш для друку. Використовує кешовані зображення з Фази 1 (без повторного запуску ШІ).

#### Параметри (тіло JSON) {#parameters-json-body}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| jobId | string | Так | - | ID завдання з Фази 1 |
| filename | string | Так | - | Оригінальне ім'я файлу з Фази 1 |
| countryCode | string | Так | - | Код країни для специфікації паспорта (наприклад, `US`, `GB`, `IN`) |
| documentType | string | Ні | `"passport"` | Тип документа (зі специфікації країни) |
| bgColor | string | Ні | `"#FFFFFF"` | Hex-код кольору фону |
| printLayout | string | Ні | `"none"` | Розкладка паперу для друку: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Ні | `0` | Обмеження максимального розміру файлу в КБ (0 = без обмеження) |
| dpi | number | Ні | `300` | Вихідний DPI (72-1200) |
| customWidthMm | number | Ні | - | Власна ширина фото в мм (перевизначає специфікацію країни) |
| customHeightMm | number | Ні | - | Власна висота фото в мм (перевизначає специфікацію країни) |
| zoom | number | Ні | `1` | Коефіцієнт масштабування (0.5-3). Значення > 1 обрізають тісніше |
| adjustX | number | Ні | `0` | Коригування горизонтальної позиції |
| adjustY | number | Ні | `0` | Коригування вертикальної позиції |
| landmarks | object | Так | - | Об'єкт орієнтирів із відповіді Фази 1 |
| imageWidth | number | Так | - | Ширина зображення з відповіді Фази 1 |
| imageHeight | number | Так | - | Висота зображення з відповіді Фази 1 |

#### Приклад запиту {#example-request-1}

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

#### Відповідь (200 OK) {#response-200-ok-1}

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

### Базовий маршрут {#base-route}

`POST /api/v1/tools/image/passport-photo`

Повертає вказівки щодо використання правильної підкінцевої точки.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Примітки {#notes}

- Потребує встановлення пакетів моделей `background-removal` та `face-detection`.
- Фаза 1 запускає ШІ (орієнтири обличчя + видалення фону) і кешує результати. Фаза 2 - це чиста маніпуляція зображенням Sharp (швидка, без потреби в ШІ).
- Орієнтири повертаються як нормалізовані координати (діапазон 0-1 відносно розмірів зображення).
- Поле `preview` у відповіді аналізу - це PNG у кодуванні base64 (максимум 800px завширшки) для швидкого відображення.
- Специфікації країн включають розміри документа, співвідношення висоти голови та позиціонування лінії очей на основі офіційних вимог до фото на паспорт.
- Опція `printLayout` генерує розкладений аркуш на папері 4x6\" або A4 з проміжками 2мм між фотографіями.
- Коли встановлено `maxFileSizeKb`, вихідне зображення ітеративно стискається, щоб вписатися в обмеження розміру.
