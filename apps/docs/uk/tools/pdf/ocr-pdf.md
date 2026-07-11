---
description: "Витягання тексту з документів PDF за допомогою OCR на основі ШІ."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: b0bc3d72aed6
---

# PDF OCR {#pdf-ocr}

Витягайте текст з документів PDF за допомогою оптичного розпізнавання символів на основі ШІ. Підтримує кілька рівнів якості та мов. Потребує встановлення набору функцій OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та необов'язковим полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Рівень якості OCR: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | Мова документа: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Вибір сторінок, наприклад `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

Повертає `202 Accepted`. Відстежуйте перебіг через SSE за адресою `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Прийнятний формат вхідних даних: `.pdf`.
- Це інструмент на основі ШІ, який потребує встановлення **набору функцій OCR**. Якщо набір не встановлено, API повертає `501 Not Implemented`.
- Рівень якості `fast` використовує легшу модель для швидшого опрацювання; `best` використовує точнішу модель за рахунок швидкості.
- Налаштування мови `auto` намагається визначити мову документа автоматично.
- Ви можете націлюватися на конкретні сторінки за допомогою діапазонів (`"1-3"`), списків через кому (`"1,3,5"`) або `"all"` для кожної сторінки.
- Для PDF, які вже містять текст із можливістю виділення, розгляньте використання швидшого інструмента [PDF to Text](./pdf-to-text).
