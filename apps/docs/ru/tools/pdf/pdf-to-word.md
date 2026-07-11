---
description: "Преобразование PDF в документ Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 76f323fcf626
---

# PDF to Word {#pdf-to-word}

Преобразуйте текстовый PDF в документ Word (DOCX). Лучше всего подходит для PDF с выделяемым текстом; отсканированные страницы сначала потребуют OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Принимает данные multipart form с PDF-файлом.

## Parameters {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите PDF, и он будет преобразован в DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
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
- Лучше всего работает с текстовыми PDF. Отсканированные страницы или страницы только с изображениями дадут пустой или минимальный вывод; используйте [PDF OCR](./ocr-pdf), чтобы сначала добавить текстовый слой.
- Преобразование выполняется LibreOffice, работающим на сервере в headless-режиме.
- Сложные макеты (многоколоночные, перекрывающиеся элементы) могут преобразоваться не идеально.
