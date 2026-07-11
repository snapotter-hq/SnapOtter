---
description: "Витягуйте текст із зображень за допомогою оптичного розпізнавання символів на основі ШІ."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 2379df96db26
---

# OCR / Витяг тексту {#ocr-text-extraction}

Витягуйте текст із зображень за допомогою оптичного розпізнавання символів на основі ШІ. Підтримує кілька мов і рівнів якості.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Обробка:** Синхронна відповідь JSON. Якщо вказано `clientJobId`, прогрес також повідомляється через SSE.

**Пакет моделі:** `ocr` (5-6 ГБ)

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (multipart) |
| quality | string | Ні | `"balanced"` | Рівень якості: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Ні | `"auto"` | Підказка мови: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Ні | `true` | Попередня обробка зображення для кращої точності OCR |
| engine | string | Ні | - | Застаріле. Використовуйте `quality` замість цього. Зіставляє `tesseract` з `fast`, `paddleocr` з `balanced` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Відповідь (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Прогрес (SSE, опціонально) {#progress-sse-optional}

Якщо вказано поле форми `clientJobId`, події прогресу передаються потоком:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Примітки {#notes}

- Потребує встановлення пакета моделі `ocr` (5-6 ГБ).
- OCR повертає витягнутий текст безпосередньо, а не URL завантаження зображення.
- Використовує ланцюжок відкату: якщо рівень вищої якості аварійно завершується (наприклад, segfault PaddleOCR), він автоматично повторює спробу з наступним нижчим рівнем.
- Якщо рівень повертає порожній текст без аварійного завершення, він також відкочується до наступного рівня.
- Рівні якості зіставляються з рушіями: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
