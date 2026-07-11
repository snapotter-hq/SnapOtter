---
description: "Захоплюйте вебсторінки або фрагменти HTML як високоякісні зображення з емуляцією пристроїв."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: 88275af0ea98
---

# HTML в зображення {#html-to-image}

Захоплюйте URL вебсторінки або сирий вміст HTML як зображення-знімок. Підтримує емуляцію пристроїв (десктоп, планшет, мобільний), захоплення повної сторінки та кілька форматів виводу.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Приймає **тіло JSON** (не multipart). Завантаження файлу не потрібне.

## Параметри {#parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| url | string | Умовно | - | URL для захоплення (має бути дійсним URL) |
| html | string | Умовно | - | Сирий вміст HTML для рендерингу (від 1 до 5 000 000 символів) |
| format | string | Ні | `"png"` | Формат виводу: `jpg`, `png`, `webp` |
| quality | number | Ні | `90` | Якість виводу для форматів із втратами (від 1 до 100) |
| fullPage | boolean | Ні | `false` | Захопити всю прокручувану сторінку, а не лише область перегляду |
| devicePreset | string | Ні | `"desktop"` | Емуляція пристрою: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Ні | `1280` | Власна ширина області перегляду в пікселях (від 320 до 3840, використовується, коли devicePreset — `custom`) |
| viewportHeight | number | Ні | `720` | Власна висота області перегляду в пікселях (від 320 до 2160, використовується, коли devicePreset — `custom`) |

Потрібно вказати або `url`, або `html`, але не обидва.

### Пресети пристроїв {#device-presets}

| Пресет | Ширина | Висота | Мобільний UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Ні |
| `tablet` | 768 | 1024 | Ні |
| `mobile` | 375 | 812 | Так |
| `custom` | (задано користувачем) | (задано користувачем) | Ні |

## Приклад запиту {#example-request}

Захоплення вебсторінки:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Рендеринг вмісту HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Примітки {#notes}

- Вимагає встановленого на сервері Chromium. Повертає HTTP 503, якщо сервіс браузера недоступний.
- URL перевіряються на атаки SSRF (приватні/внутрішні мережеві адреси блокуються).
- Цей кінцевий пункт обмежено до 120 запитів на годину.
- `originalSize` завжди дорівнює 0, оскільки цей інструмент генерує зображення з URL/HTML.
- Імʼя вихідного файлу — `screenshot.<format>`.
- Якщо сторінка завантажується надто довго, запит повертає HTTP 504 (тайм-аут шлюзу).
- Якщо сервіс браузера неодноразово падає, він тимчасово вимикається та повертає HTTP 503 з кодом `BROWSER_CRASHED`.
