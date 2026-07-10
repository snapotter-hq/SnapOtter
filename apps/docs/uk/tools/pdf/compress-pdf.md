---
description: "Зменшення розміру файлу PDF шляхом стиснення вбудованих зображень."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 9493bdedff6d
---

# Compress PDF {#compress-pdf}

Зменшуйте розмір файлу PDF шляхом зниження роздільної здатності вбудованих зображень. Оберіть повзунок якості або цільовий розмір файлу.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Режим стиснення: `quality` або `targetSize` |
| quality | integer | No | `75` | Якість стиснення, 1-100 (вище = менше стиснення). Використовується в режимі `quality` |
| targetSizeKb | number | No | - | Цільовий розмір файлу в кілобайтах. Використовується в режимі `targetSize` |

## Example Request {#example-request}

Стиснення за якістю:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Стиснення до цільового розміру:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- У режимі `quality` нижчі значення дають менші файли з більшою деградацією зображення.
- У режимі `targetSize` двійковий пошук знаходить найвищий DPI, який вкладається в запитаний розмір.
- Якщо стиснення збільшило б файл, повертаються вихідні байти без змін.
- Текст і векторний вміст не зазнають впливу; знижується роздільна здатність лише вбудованих растрових зображень.
