---
description: "Преобразование PDF в Markdown с сохранением заголовков, списков и таблиц, если они есть в PDF."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 0b674814e7f9
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

Превратите PDF в файл Markdown, который можно разместить в вики, на статическом сайте или использовать в конвейере для LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Принимает данные multipart form с PDF-файлом.

## Parameters {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите PDF, и вы получите файл `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Большой PDF может обрабатываться дольше окна синхронного ответа. Тогда API отвечает `202` с `jobId`, а прогресс можно отслеживать по адресу `/api/v1/jobs/{jobId}/progress`.

## What gets kept {#what-gets-kept}

PDF хранит позиционированный текст, а не структуру, поэтому конвертер определяет её сам:

- **Заголовки.** Короткие строки заметно крупнее основного текста становятся заголовками от `#` до `######`, ранжированными по размеру во всём документе.
- **Списки.** Строки, начинающиеся с маркера или номера, становятся элементами списка.
- **Полужирный, курсив и ссылки.** Сохраняются в тексте. Остаются только ссылки `http`, `https` и `mailto`.
- **Таблицы.** Таблицы, нарисованные линиями, превращаются в таблицы Markdown. Таблицы, оформленные одними пробелами, обычно превращаются в обычные абзацы.

Изображения отбрасываются. Многоколоночные макеты и необычное оформление страниц обрабатываются по мере возможности, поэтому проверьте результат, прежде чем на него полагаться.

## Notes {#notes}

- Принимаемый входной формат: `.pdf`.
- Поле `chars` в ответе - это длина выходного Markdown.
- У отсканированного PDF нет текстового слоя для преобразования. Инструмент отклоняет его с `422` и кодом `NO_TEXT_LAYER` вместо того, чтобы вернуть пустой файл. Для таких файлов используйте инструмент [PDF OCR](./ocr-pdf).
- Для обратного преобразования [Markdown в PDF](../files/markdown-to-pdf), [Markdown в DOCX](../files/markdown-to-docx) и [Markdown в HTML](../files/markdown-to-html) читают файлы `.md`.
