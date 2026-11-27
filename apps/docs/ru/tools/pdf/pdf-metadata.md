---
description: "Чтение и запись метаданных документа PDF."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: 27a0420b0783
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

Читайте и обновляйте поля метаданных документа PDF, такие как заголовок, автор, тема и ключевые слова, или полностью удаляйте метаданные документа. Если настройки не переданы, существующие метаданные возвращаются без изменений.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Принимает данные multipart form с PDF-файлом и необязательным JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| title | string | Нет | - | Заголовок документа (не более 500 символов) |
| author | string | Нет | - | Автор документа (не более 500 символов) |
| subject | string | Нет | - | Тема документа (не более 500 символов) |
| keywords | string | Нет | - | Ключевые слова документа (не более 500 символов) |
| stripAll | boolean | Нет | false | Удалить весь словарь Info (даты, Creator, Producer, пользовательские ключи), все потоки XMP (документа, страниц, изображений) и все данные приложений PieceInfo, а затем записать поля, указанные выше |
| removeAttachments | boolean | Нет | false | Дополнительно удалить встроенные файлы: список вложений документа, аннотации файловых вложений и связанные файлы (`/AF`). Требует `stripAll` |

Все параметры необязательны. Пропущенные поля остаются без изменений, если не задан `stripAll`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Принимаемый входной формат: `.pdf`.
- Это быстрый (синхронный) инструмент, который возвращает результат напрямую.
- Поле `metadata` в ответе содержит итоговые метаданные после всех обновлений.
- Чтобы прочитать метаданные без изменения, пропустите поле `settings` или отправьте пустой объект.
- Каждое поле метаданных ограничено 500 символами.
- С `stripAll` ответ также содержит `stripped`: удалённые ключи Info (`removed`), был ли удалён поток XMP документа (`xmpRemoved`), уровень PDF/A, объявленный во входном файле (`pdfa` или `null`), сколько потоков XMP снято со страниц, изображений и других объектов (`objectXmpRemoved`), сколько словарей PieceInfo удалено (`pieceInfoRemoved`) и сколько встроенных файлов удалено (`attachmentsRemoved`, всегда `0` без `removeAttachments`). Удаление XMP нарушает соответствие PDF/A.
- `stripAll` сам по себе сохраняет встроенные файловые вложения, так как их удаление меняет содержимое документа. Добавьте `removeAttachments`, чтобы удалить и их. Это удалит прикреплённый XML из электронных счетов ZUGFeRD и Factur-X и нарушит соответствие PDF/A-3.
- Отправка `removeAttachments` без `stripAll` возвращает 400.
