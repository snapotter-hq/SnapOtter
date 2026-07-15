---
description: "Преобразование PDF в архивный формат PDF/A-2 для долгосрочного хранения."
i18n_source_hash: 9c568a340b6f
i18n_provenance: human
i18n_output_hash: 7ae905e350c4
---

# Конвертер PDF/A {#pdf-a-convert}

Преобразуйте PDF в архивный формат PDF/A-2, подходящий для долгосрочного хранения и соответствия нормативным требованиям.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Принимает данные multipart form с PDF-файлом. Поле `settings` не требуется.

## Parameters {#parameters}

У этого инструмента нет параметров настроек. Загрузите PDF-файл напрямую.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- Вывод соответствует стандарту PDF/A-2.
- PDF/A встраивает все шрифты и запрещает внешние ссылки, поэтому выходной файл может быть больше исходного.
- Шифрование и JavaScript удаляются при преобразовании, так как они не допускаются стандартом PDF/A.
