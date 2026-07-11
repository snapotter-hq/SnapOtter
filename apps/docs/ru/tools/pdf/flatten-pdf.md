---
description: "Запекание форм и аннотаций в содержимое страниц."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 2ef7c4b8bff2
---

# Flatten PDF {#flatten-pdf}

Запеките интерактивные поля форм и аннотации в содержимое страниц, получив статический PDF, который выглядит одинаково везде.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Принимает данные multipart form с PDF-файлом.

## Parameters {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите PDF, и все формы и аннотации будут сведены.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Принимаемый входной формат: `.pdf`.
- Это быстрый (синхронный) инструмент, который возвращает результат напрямую.
- Значения полей форм сохраняются в выходном файле как статический текст.
- Аннотации (комментарии, выделения, стикеры) становятся частью содержимого страницы и больше не могут редактироваться.
