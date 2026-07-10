---
description: "Добавление текстового водяного знака на каждую страницу PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 4b382763b021
---

# Watermark PDF {#watermark-pdf}

Наложите текстовый водяной знак на каждую страницу PDF с настраиваемым положением, размером, непрозрачностью и поворотом.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| text | string | Да | - | Текст водяного знака (1-200 символов) |
| position | string | Нет | `"c"` | Расположение на странице: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Нет | `48` | Размер шрифта в пунктах (6-72) |
| opacity | number | Нет | `0.3` | Непрозрачность водяного знака (0.05-1) |
| rotation | number | Нет | `45` | Угол поворота в градусах (-180 до 180) |

### Position Values {#position-values}

- `tl` вверху слева, `tc` вверху по центру, `tr` вверху справа
- `l` по центру слева, `c` по центру, `r` по центру справа
- `bl` внизу слева, `bc` внизу по центру, `br` внизу справа

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Водяной знак отображается как текстовое наложение на каждой странице.
- Один и тот же текст, положение и стиль водяного знака применяются единообразно ко всем страницам.
- Используйте более низкие значения непрозрачности (0.1-0.3) для ненавязчивых водяных знаков, не закрывающих содержимое.
