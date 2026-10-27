---
description: "Видалення фону на основі ШІ з опціональними ефектами (розмиття, тінь, градієнт, власний фон)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 7f67064ec4a9
---

# Видалення фону {#remove-background}

Видалення фону на основі ШІ з опціональними ефектами (розмиття, тінь, градієнт, власний фон).

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Пакет моделі:** `background-removal` (4-5 ГБ)

## Параметри {#parameters}

Фаза 1 видаляє фон і кешує прозору PNG-маску та оригінальне зображення. Заміна фону, розмиття, падаюча тінь і конвертація формату виводу застосовуються у [Фазі 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (або коли `remove-background` виконується як крок конвеєра чи пакетне завдання); передавання цих полів у Фазу 1 повертає 400.

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| model | string | Ні | - | Варіант моделі ШІ для використання |
| edgeRefine | integer | Ні | - | Рівень уточнення країв (0-3) |
| decontaminate | boolean | Ні | - | Видалити кольорові розтікання з країв |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

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

## Кінцева точка ефектів (Фаза 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Повторно застосовує фонові ефекти без повторного запуску моделі ШІ. Використовує кешовану маску та оригінал з Фази 1.

### Параметри {#parameters-1}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| settings | JSON | Так | - | JSON із налаштуваннями ефектів (див. нижче) |
| backgroundImage | file | Так, коли `backgroundType` — `image` | - | Власне зображення фону |

#### Поля JSON налаштувань {#settings-json-fields}

| Поле | Тип | Обов'язкове | За замовчуванням | Опис |
|-------|------|----------|---------|-------------|
| jobId | string | Так | - | ID завдання з Фази 1 |
| filename | string | Так | - | Оригінальне ім'я файлу з Фази 1 |
| backgroundType | string | Ні | `"transparent"` | Один з: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Так, коли `backgroundType` — `color` | - | Hex-колір: `#RRGGBB` або `#RGB` (символ `#` необов'язковий) |
| gradientColor1 | string | Так, коли `backgroundType` — `gradient` | - | Перший колір градієнта, hex як у `backgroundColor` |
| gradientColor2 | string | Так, коли `backgroundType` — `gradient` | - | Другий колір градієнта, hex як у `backgroundColor` |
| gradientAngle | number | Ні | - | Кут градієнта в градусах |
| blurEnabled | boolean | Ні | - | Розмити оригінальний фон за об'єктом (`backgroundType: "blur"` має на увазі це) |
| blurIntensity | number | Ні | - | Інтенсивність розмиття (0-100) |
| shadowEnabled | boolean | Ні | - | Увімкнути падаючу тінь на об'єкті |
| shadowOpacity | number | Ні | `35` | Непрозорість тіні (0-100), використовується, коли `shadowEnabled` дорівнює true |
| outputFormat | string | Ні | `"png"` | Вихідний формат: `png`, `webp` або `avif` |

### Приклад запиту {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Відповідь (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### Помилка: Видалення фону застаріло (410) {#error-background-removal-expired-410}

Кінцева точка ефектів працює з маскою та оригіналом, які Фаза 1 зберегла для `jobId`. Збережені результати через деякий час очищаються, тож якщо між двома викликами мине забагато часу, їх уже не буде. Запустіть Фазу 1 знову з тим самим зображенням і використайте `jobId`, який вона поверне.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

`jobId` або `filename`, які не вказують на збережений файл (роздільник шляху, `..`, порожній рядок), отримують відповідь 400.

## Примітки {#notes}

- Потребує встановлення пакета моделі `background-removal` (4-5 ГБ).
- Фаза 1 кешує прозору маску та оригінальне зображення, щоб Фаза 2 (ефекти) могла миттєво повторно застосовувати різні фони без повторного запуску моделі ШІ.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
- Поворот EXIF автоматично коригується перед обробкою.
