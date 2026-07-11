---
description: "Извлечение текста из изображений с помощью оптического распознавания символов на основе ИИ."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 9f55daae9054
---

# OCR / Извлечение текста {#ocr-text-extraction}

Извлечение текста из изображений с помощью оптического распознавания символов на основе ИИ. Поддерживает несколько языков и уровней качества.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Обработка:** синхронный JSON-ответ. Если указан `clientJobId`, прогресс также сообщается через SSE.

**Пакет модели:** `ocr` (5-6 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| quality | string | Нет | `"balanced"` | Уровень качества: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Нет | `"auto"` | Языковая подсказка: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Нет | `true` | Предварительная обработка изображения для повышения точности OCR |
| engine | string | Нет | - | Устарело. Используйте `quality` вместо этого. Сопоставляет `tesseract` с `fast`, `paddleocr` с `balanced` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Ответ (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Прогресс (SSE, опционально) {#progress-sse-optional}

Если передано поле формы `clientJobId`, транслируются события прогресса:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Примечания {#notes}

- Требует установленного пакета модели `ocr` (5-6 ГБ).
- OCR возвращает извлечённый текст напрямую, а не URL для скачивания изображения.
- Использует цепочку запасных вариантов: если уровень более высокого качества падает (например, segfault PaddleOCR), происходит автоматический повтор на следующем более низком уровне.
- Если уровень возвращает пустой текст без сбоя, он также переходит на следующий уровень.
- Уровни качества сопоставляются с движками: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
