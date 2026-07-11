---
description: "Сканування зображень на наявність QR-кодів, штрихкодів та двовимірних кодів з анотованим виводом."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: b74b7d7c8b5a
---

# Зчитувач штрихкодів {#barcode-reader}

Сканування завантажених зображень на наявність усіх типів штрихкодів та QR-кодів. Повертає розшифрований текст, тип штрихкоду та дані про положення для кожного виявленого коду. Також генерує анотоване зображення з кольоровими обмежувальними рамками навколо виявлених кодів.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Приймає дані форми у форматі multipart із файлом зображення та необов'язковим полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | Ні | `true` | Увімкнути агресивний режим сканування для складніших для зчитування штрихкодів (повільніше, але ретельніше) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Приклад відповіді {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Поля відповіді {#response-fields}

| Поле | Тип | Опис |
|-------|------|-------------|
| filename | string | Початкове ім'я файлу |
| barcodes | array | Масив об'єктів виявлених штрихкодів |
| annotatedUrl | string або null | URL для завантаження анотованого зображення (null, якщо штрихкодів не знайдено) |
| previewUrl | string або null | Те саме, що annotatedUrl (для сумісності з попереднім переглядом фронтенду) |

### Об'єкт штрихкоду {#barcode-object}

| Поле | Тип | Опис |
|-------|------|-------------|
| type | string | Формат штрихкоду (QRCode, EAN-13, Code128, DataMatrix, PDF417 тощо) |
| text | string | Розшифрований вміст штрихкоду |
| position | object | Обмежувальна рамка з координатами topLeft, topRight, bottomLeft, bottomRight |

## Підтримувані типи штрихкодів {#supported-barcode-types}

Одновимірні штрихкоди: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

Двовимірні штрихкоди: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Примітки {#notes}

- Використовує бібліотеку zxing-wasm для виявлення штрихкодів.
- Анотоване зображення накладає кольорові багатокутні обмежувальні рамки та пронумеровані підписи на кожен виявлений штрихкод.
- В одному зображенні можна виявити до 255 штрихкодів.
- Якщо штрихкодів не знайдено, `barcodes` є порожнім масивом, а `annotatedUrl` дорівнює null.
- Режим `tryHarder` виконує ретельніше сканування ціною часу обробки. Вимкніть його для швидшої обробки чистих, добре вирівняних штрихкодів.
- Анотований вивід завжди у форматі PNG.
- Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед скануванням.
- Орієнтація EXIF застосовується автоматично перед обробкою.
