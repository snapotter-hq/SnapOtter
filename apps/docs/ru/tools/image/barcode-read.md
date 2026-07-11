---
description: "Сканирование изображений на наличие QR-кодов, штрихкодов и 2D-кодов с аннотированным выводом."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: a1bfae5a8707
---

# Сканер штрихкодов {#barcode-reader}

Сканируйте загруженные изображения на наличие всех типов штрихкодов и QR-кодов. Возвращает декодированный текст, тип штрихкода и данные о положении для каждого обнаруженного кода. Также создаёт аннотированное изображение с цветными ограничивающими рамками вокруг обнаруженных кодов.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Принимает multipart form data с файлом изображения и необязательным полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | Нет | `true` | Включить агрессивный режим сканирования для труднораспознаваемых штрихкодов (медленнее, но тщательнее) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Пример ответа {#example-response}

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

## Поля ответа {#response-fields}

| Поле | Тип | Описание |
|-------|------|-------------|
| filename | string | Исходное имя файла |
| barcodes | array | Массив объектов обнаруженных штрихкодов |
| annotatedUrl | string или null | URL для скачивания аннотированного изображения (null, если штрихкоды не найдены) |
| previewUrl | string или null | То же, что и annotatedUrl (для совместимости с предпросмотром во фронтенде) |

### Объект штрихкода {#barcode-object}

| Поле | Тип | Описание |
|-------|------|-------------|
| type | string | Формат штрихкода (QRCode, EAN-13, Code128, DataMatrix, PDF417 и т. д.) |
| text | string | Декодированное содержимое штрихкода |
| position | object | Ограничивающая рамка с координатами topLeft, topRight, bottomLeft, bottomRight |

## Поддерживаемые типы штрихкодов {#supported-barcode-types}

1D-штрихкоды: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

2D-штрихкоды: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Примечания {#notes}

- Использует библиотеку zxing-wasm для обнаружения штрихкодов.
- Аннотированное изображение накладывает цветные многоугольные ограничивающие рамки и нумерованные метки на каждый обнаруженный штрихкод.
- В одном изображении может быть обнаружено до 255 штрихкодов.
- Если штрихкоды не найдены, `barcodes` представляет собой пустой массив, а `annotatedUrl` равен null.
- Режим `tryHarder` выполняет более тщательное сканирование за счёт времени обработки. Отключите его для более быстрой обработки чистых, хорошо выровненных штрихкодов.
- Аннотированный вывод всегда в формате PNG.
- Входные данные HEIC, RAW, PSD и SVG автоматически декодируются перед сканированием.
- Ориентация EXIF применяется автоматически перед обработкой.
