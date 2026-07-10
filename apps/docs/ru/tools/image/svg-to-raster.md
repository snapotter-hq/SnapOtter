---
description: "Конвертация файлов SVG в PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF или JXL с произвольным разрешением и DPI, с поддержкой пакетной обработки."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: ceb4945267fb
---

# SVG в растр {#svg-to-raster}

Конвертируйте файлы SVG в растровые форматы изображений (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF или JXL) с произвольным разрешением и DPI. Также поддерживает пакетную конвертацию нескольких SVG.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| width | integer | Нет | - | Целевая ширина в пикселях (от 1 до 65536). Сохраняет соотношение сторон, если задан только один размер. |
| height | integer | Нет | - | Целевая высота в пикселях (от 1 до 65536). Сохраняет соотношение сторон, если задан только один размер. |
| dpi | integer | Нет | 300 | DPI рендеринга, управляет базовой плотностью растеризации (от 36 до 2400) |
| quality | number | Нет | 90 | Качество вывода для форматов с потерями (от 1 до 100) |
| backgroundColor | string | Нет | `"#00000000"` | Цвет фона в шестнадцатеричном формате (6 или 8 символов, 8-символьный включает альфа-канал) |
| outputFormat | string | Нет | `"png"` | Формат вывода: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Конечная точка пакетной обработки {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Конвертируйте несколько файлов SVG за один запрос. Возвращает ZIP-архив.

### Дополнительные параметры пакетной обработки {#additional-batch-parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Нет | - | Опциональный клиентский ID задания для отслеживания прогресса (макс. 128 символов) |

### Пример пакетного запроса {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Пакетный ответ {#batch-response}

Конечная точка пакетной обработки передаёт ZIP-файл напрямую с заголовками:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Примечания {#notes}

- Принимает только файлы SVG и SVGZ (проверяет содержимое, а не только расширение). SVGZ автоматически распаковывается.
- Содержимое SVG санируется перед рендерингом для предотвращения XSS и загрузки внешних ресурсов.
- Настройка `dpi` управляет плотностью, с которой растеризуется SVG. Более высокий DPI даёт большие пиксельные размеры из того же viewport SVG.
- Когда заданы и `width`, и `height`, изображение масштабируется с помощью `fit: inside` (сохраняет соотношение сторон в пределах границ).
- `previewUrl` включается в ответ для форматов, которые браузеры не могут отобразить нативно (TIFF, HEIF). Предпросмотр представляет собой миниатюру WebP размером 1200px.
- Фон по умолчанию `#00000000` полностью прозрачный. Установите значение `#FFFFFF` для белого фона (полезно при выводе в JPEG, который не поддерживает прозрачность).
- Пакетная обработка учитывает конфигурацию сервера `MAX_BATCH_SIZE` и использует параллельных исполнителей для производительности.
- Прогресс пакетных операций можно отслеживать через SSE по адресу `/api/v1/jobs/:jobId/progress`.
