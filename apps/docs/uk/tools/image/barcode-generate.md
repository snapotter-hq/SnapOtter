---
description: "Генерація штрихкодів у форматах Code 128, EAN-13, UPC-A, Code 39, ITF-14 та Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 06e0f512914e
---

# Генератор штрихкодів {#barcode-generator}

Генерація зображень штрихкодів із текстового введення. Підтримує формати Code 128, EAN-13, UPC-A, Code 39, ITF-14 та Data Matrix.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Приймає тіло `application/json` (не multipart). Штрихкод генерується з наданого тексту, а не із завантаженого файлу.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| text | string | Так | - | Текст для кодування в штрихкоді (1-256 символів) |
| type | string | Ні | `"code128"` | Формат штрихкоду: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | Ні | `3` | Коефіцієнт масштабу зображення (1-8) |
| includeText | boolean | Ні | `true` | Чи відображати текст під штрихкодом |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Примітки {#notes}

- На відміну від більшості інструментів, ця кінцева точка приймає тіло JSON, а не дані форми multipart, оскільки штрихкоди генеруються з тексту, а не із завантаженого файлу.
- EAN-13 потребує рівно 12 або 13 цифр. UPC-A потребує рівно 11 або 12 цифр. Якщо контрольну цифру пропущено, вона обчислюється автоматично.
- Code 128 є найгнучкішим форматом і підтримує повний набір символів ASCII.
- Data Matrix створює двовимірний штрихкод, придатний для кодування довших рядків у компактному квадраті.
