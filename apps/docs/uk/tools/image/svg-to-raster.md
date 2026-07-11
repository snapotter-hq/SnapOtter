---
description: "Конвертація файлів SVG у PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF або JXL з довільною роздільною здатністю та DPI, з підтримкою пакетної обробки."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: babd1aef9097
---

# SVG у растр {#svg-to-raster}

Конвертуйте файли SVG у растрові формати зображень (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF або JXL) з довільною роздільною здатністю та DPI. Також підтримує пакетну конвертацію кількох SVG.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| width | integer | Ні | - | Цільова ширина у пікселях (від 1 до 65536). Зберігає співвідношення сторін, якщо встановлено лише один розмір. |
| height | integer | Ні | - | Цільова висота у пікселях (від 1 до 65536). Зберігає співвідношення сторін, якщо встановлено лише один розмір. |
| dpi | integer | Ні | 300 | DPI рендерингу, керує базовою щільністю растеризації (від 36 до 2400) |
| quality | number | Ні | 90 | Якість виводу для форматів зі втратами (від 1 до 100) |
| backgroundColor | string | Ні | `"#00000000"` | Колір фону у шістнадцятковому форматі (6 або 8 символів, 8-символьний включає альфа) |
| outputFormat | string | Ні | `"png"` | Формат виводу: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Кінцева точка пакетної обробки {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Конвертуйте кілька файлів SVG в одному запиті. Повертає архів ZIP.

### Додаткові параметри пакетної обробки {#additional-batch-parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Ні | - | Необов’язковий наданий клієнтом ідентифікатор завдання для відстеження прогресу (макс. 128 символів) |

### Приклад запиту пакетної обробки {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Відповідь пакетної обробки {#batch-response}

Кінцева точка пакетної обробки передає файл ZIP безпосередньо із заголовками:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Примітки {#notes}

- Приймає лише файли SVG та SVGZ (перевіряє вміст, а не лише розширення). SVGZ автоматично розпаковується.
- Вміст SVG санітизується перед рендерингом, щоб запобігти XSS та завантаженню зовнішніх ресурсів.
- Налаштування `dpi` керує щільністю, з якою растеризується SVG. Вищий DPI дає більші піксельні розміри з того самого вікна перегляду SVG.
- Коли надано обидва `width` та `height`, зображення масштабується за допомогою `fit: inside` (зберігає співвідношення сторін у межах меж).
- `previewUrl` включається до відповіді для форматів, які браузери не можуть відобразити нативно (TIFF, HEIF). Попередній перегляд — це мініатюра WebP розміром 1200px.
- Стандартний фон `#00000000` є повністю прозорим. Встановіть `#FFFFFF` для білого фону (корисно для виводу JPEG, який не підтримує прозорість).
- Пакетна обробка враховує конфігурацію сервера `MAX_BATCH_SIZE` і використовує паралельні робочі процеси для продуктивності.
- Прогрес пакетних операцій можна відстежувати через SSE на `/api/v1/jobs/:jobId/progress`.
