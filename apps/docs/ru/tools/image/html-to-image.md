---
description: "Захват веб-страниц или HTML-фрагментов в виде высококачественных изображений с эмуляцией устройств."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: adbfd040c1ee
---

# HTML в изображение {#html-to-image}

Захватывает URL веб-страницы или необработанное HTML-содержимое как изображение-скриншот. Поддерживает эмуляцию устройств (десктоп, планшет, мобильный), захват всей страницы и несколько выходных форматов.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Принимает **тело JSON** (не multipart). Загрузка файла не требуется.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| url | string | Условно | - | URL для захвата (должен быть корректным URL) |
| html | string | Условно | - | Необработанное HTML-содержимое для рендеринга (от 1 до 5 000 000 символов) |
| format | string | Нет | `"png"` | Выходной формат: `jpg`, `png`, `webp` |
| quality | number | Нет | `90` | Качество вывода для форматов с потерями (от 1 до 100) |
| fullPage | boolean | Нет | `false` | Захватить всю прокручиваемую страницу, а не только область просмотра |
| devicePreset | string | Нет | `"desktop"` | Эмуляция устройства: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Нет | `1280` | Пользовательская ширина области просмотра в пикселях (от 320 до 3840, используется при devicePreset равном `custom`) |
| viewportHeight | number | Нет | `720` | Пользовательская высота области просмотра в пикселях (от 320 до 2160, используется при devicePreset равном `custom`) |

Должен быть указан либо `url`, либо `html`, но не оба сразу.

### Пресеты устройств {#device-presets}

| Пресет | Ширина | Высота | Мобильный UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Нет |
| `tablet` | 768 | 1024 | Нет |
| `mobile` | 375 | 812 | Да |
| `custom` | (задаётся пользователем) | (задаётся пользователем) | Нет |

## Пример запроса {#example-request}

Захват веб-страницы:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Рендеринг HTML-содержимого:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Примечания {#notes}

- Требуется установленный на сервере Chromium. Возвращает HTTP 503, если служба браузера недоступна.
- URL проверяются на атаки SSRF (адреса частных/внутренних сетей блокируются).
- Эта конечная точка ограничена 120 запросами в час.
- `originalSize` всегда равно 0, поскольку этот инструмент генерирует изображения из URL/HTML.
- Имя выходного файла: `screenshot.<format>`.
- Если страница загружается слишком долго, запрос возвращает HTTP 504 (таймаут шлюза).
- Если служба браузера падает многократно, она временно отключается и возвращает HTTP 503 с кодом `BROWSER_CRASHED`.
