---
description: "Объединение нескольких PDF в один документ."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: 7bf1e96e1bb8
---

# Merge PDFs {#merge-pdfs}

Объедините два или более PDF-файлов в один документ, сохраняя порядок страниц каждого исходного файла.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Принимает данные multipart form с двумя или более PDF-файлами. Поле `settings` не требуется.

## Parameters {#parameters}

У этого инструмента нет параметров настроек. Просто загрузите два или более PDF-файлов.

| Ограничение | Значение |
|------------|-------|
| Минимум файлов | 2 |
| Максимум файлов | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Файлы объединяются в том порядке, в котором они загружены.
- Требуется не менее двух PDF-файлов; при меньшем количестве запрос завершится ошибкой 400.
- Максимальное количество входных файлов равно 20.
- Зашифрованные PDF должны быть разблокированы перед объединением.
