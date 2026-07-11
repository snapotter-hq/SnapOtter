---
description: "Конвертация между форматами Word, OpenDocument, RTF и обычного текста."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: c70e1cad6e24
---

# Конвертация документа {#convert-document}

Конвертация документов между форматами Word (DOCX), OpenDocument (ODT), RTF и обычного текста с помощью LibreOffice.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Принимает multipart form data с файлом Word/ODT/RTF/TXT и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Да | - | Формат вывода: `docx`, `odt`, `rtf`, `txt` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
```

## Пример ответа {#example-response}

Возвращает `202 Accepted`. Отслеживайте прогресс через SSE по адресу `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Примечания {#notes}

- Принимаемые входные форматы: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Конвертация выполняется LibreOffice, работающим в безголовом режиме на сервере.
- Сложное форматирование (макросы, встроенные объекты) может не сохраниться при конвертации между форматами.
- Выходной формат должен отличаться от входного.
