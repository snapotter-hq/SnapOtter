---
description: "Генерация штрихкодов в форматах Code 128, EAN-13, UPC-A, Code 39, ITF-14 и Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 821bd4582c66
---

# Генератор штрихкодов {#barcode-generator}

Генерируйте изображения штрихкодов из текстового ввода. Поддерживаются форматы Code 128, EAN-13, UPC-A, Code 39, ITF-14 и Data Matrix.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Принимает тело `application/json` (не multipart). Штрихкод генерируется из предоставленного текста, а не из загруженного файла.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| text | string | Да | - | Текст для кодирования в штрихкоде (1–256 символов) |
| type | string | Нет | `"code128"` | Формат штрихкода: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | Нет | `3` | Коэффициент масштаба изображения (1–8) |
| includeText | boolean | Нет | `true` | Отображать ли текст под штрихкодом |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Примечания {#notes}

- В отличие от большинства инструментов, эта конечная точка принимает тело JSON, а не multipart form data, поскольку штрихкоды генерируются из текста, а не из загруженного файла.
- EAN-13 требует ровно 12 или 13 цифр. UPC-A требует ровно 11 или 12 цифр. Если контрольная цифра опущена, она вычисляется автоматически.
- Code 128 является самым гибким форматом и поддерживает полный набор символов ASCII.
- Data Matrix создаёт 2D-штрихкод, подходящий для кодирования более длинных строк в компактном квадрате.
