---
description: "Извлечение текста из PDF-документов с помощью OCR на базе ИИ."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 563e222b9e12
---

# PDF OCR {#pdf-ocr}

Извлекайте текст из PDF-документов с помощью оптического распознавания символов на базе ИИ. Поддерживает несколько уровней качества и языков. Требует установленного пакета функций OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Принимает данные multipart form с PDF-файлом и необязательным JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| quality | string | Нет | `"balanced"` | Уровень качества OCR: `fast`, `balanced`, `best` |
| language | string | Нет | `"auto"` | Язык документа: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Нет | `"all"` | Выбор страниц, например `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

Возвращает `202 Accepted`. Отслеживайте прогресс через SSE по адресу `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Принимаемый входной формат: `.pdf`.
- Это инструмент ИИ, требующий установленного **пакета функций OCR**. Если пакет не установлен, API возвращает `501 Not Implemented`.
- Уровень качества `fast` использует более лёгкую модель для более быстрой обработки; `best` использует более точную модель ценой скорости.
- Настройка языка `auto` пытается определить язык документа автоматически.
- Вы можете указать конкретные страницы с помощью диапазонов (`"1-3"`), списков через запятую (`"1,3,5"`) или `"all"` для всех страниц.
- Для PDF, которые уже содержат выделяемый текст, рассмотрите использование более быстрого инструмента [PDF to Text](./pdf-to-text).
