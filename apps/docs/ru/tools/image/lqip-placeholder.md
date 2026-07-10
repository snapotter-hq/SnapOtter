---
description: "Генерация крошечного низкокачественного изображения-заполнителя с base64 data URI."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: c5066b8f5647
---

# Заполнитель LQIP {#lqip-placeholder}

Создаёт крошечное низкокачественное изображение-заполнитель (LQIP) из исходного изображения. Возвращает небольшой файл заполнителя вместе с base64 data URI, готовым к использованию HTML-тегом `<img>` и CSS-фрагментом `background-image` для немедленного встраивания.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Принимает данные формы multipart с файлом изображения и полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| width | integer | Нет | `16` | Целевая ширина в пикселях (4-64) |
| blur | number | Нет | `2` | Радиус размытия для стратегии размытия (0-20) |
| strategy | string | Нет | `"blur"` | Стратегия заполнителя: `blur`, `pixelate` или `solid` |
| format | string | Нет | `"webp"` | Выходной формат: `webp`, `png` или `jpeg` |
| quality | integer | Нет | `50` | Качество вывода (1-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Примечания {#notes}

- Поле `dataUri` содержит полный data URI, готовый к использованию в атрибутах `src` или CSS без дополнительных запросов.
- Поля `html` и `css` предоставляют готовые к копированию фрагменты для распространённых сценариев использования.
- Стратегия `blur` даёт мягкую, размытую миниатюру. Стратегия `pixelate` создаёт блочную мозаику. Стратегия `solid` возвращает единый усреднённый цвет.
- Типичные размеры заполнителей составляют 200-500 байт, что делает их пригодными для встраивания напрямую в HTML.
- Высота вычисляется автоматически для сохранения соотношения сторон исходного изображения.
- Входные данные HEIC, RAW, PSD и SVG декодируются автоматически перед обработкой.
