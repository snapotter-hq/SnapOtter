---
description: "Создавайте мемы с помощью шаблонов или собственных изображений, стилизованных текстовых блоков и вариантов шрифта."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: e7aa9263b0e8
---

# Генератор мемов {#meme-generator}

Создавайте мемы, используя встроенные шаблоны или собственные изображения. Добавляйте текст в классическом стиле мемов (жирный, с обводкой), несколько предустановок компоновки и варианты шрифта.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Принимает одно из двух:
- **Multipart form data** с файлом изображения и JSON-полем `settings` (режим собственного изображения)
- **JSON-тело** с `templateId` (режим шаблона, загрузка файла не требуется)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| templateId | string | Нет | - | ID встроенного шаблона мема. Если указан, загрузка изображения не нужна |
| textLayout | string | Нет | `"top-bottom"` | Компоновка текстовых блоков: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Нет | `[]` | Массив объектов текстовых блоков с полями `id` и `text` |
| fontFamily | string | Нет | `"anton"` | Шрифт: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Нет | auto | Размер шрифта в пикселях (от 8 до 200). Вычисляется автоматически, если не задан |
| textColor | string | Нет | `"#ffffff"` | Цвет заливки текста |
| strokeColor | string | Нет | `"#000000"` | Цвет обводки/контура текста |
| textAlign | string | Нет | `"center"` | Выравнивание текста: `left`, `center`, `right` |
| allCaps | boolean | Нет | `true` | Перевести текст в верхний регистр |

### Текстовые блоки {#text-boxes}

Каждый элемент массива `textBoxes` должен содержать:

| Поле | Тип | Описание |
|-------|------|-------------|
| id | string | Идентификатор блока, соответствующий компоновке (например, `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Текст мема для отображения |

### Идентификаторы блоков компоновки текста {#text-layout-box-ids}

| Компоновка | Доступные ID блоков |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Пример запроса {#example-request}

Собственное изображение с верхним и нижним текстом:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

С использованием встроенного шаблона (JSON-тело, без загрузки файла):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Примечания {#notes}

- Требуется либо `templateId`, либо загруженный файл изображения. Если указано и то, и другое, используется шаблон.
- Шаблоны задают собственные позиции текстовых блоков; параметр `textLayout` игнорируется при использовании шаблонов.
- Текст отрисовывается как SVG с контурной обводкой для классического вида мема.
- Размер шрифта вычисляется автоматически, чтобы вписаться в текстовый блок, если не задан явно.
- Пустые текстовые блоки пропускаются (отрисовки не происходит, если все блоки пусты).
- Имя выходного файла включает ID шаблона при использовании шаблонов (например, `meme-drake.png`).
- Входные данные в форматах HEIC, RAW, PSD и SVG автоматически декодируются перед обработкой.
