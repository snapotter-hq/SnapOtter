---
description: "Обрезка изображения по центрированному кругу с прозрачными углами."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 80e33d07f23d
---

# Круглая обрезка {#circle-crop}

Обрежьте изображение по центрированному кругу с прозрачными углами. Поддерживается регулируемое масштабирование, смещение, рамка и выходной размер.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Принимает multipart form data с файлом изображения и полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| zoom | number | Нет | `1` | Коэффициент масштабирования (1–5); более высокие значения обрезают плотнее |
| offsetX | number | Нет | `0.5` | Горизонтальное положение центра (0–1) |
| offsetY | number | Нет | `0.5` | Вертикальное положение центра (0–1) |
| borderWidth | integer | Нет | `0` | Ширина рамки в пикселях (0–200) |
| borderColor | string | Нет | `"#ffffff"` | Hex-цвет рамки |
| background | string | Нет | `"transparent"` | Заливка углов: `"transparent"` или hex-цвет |
| outputSize | integer | Нет | - | Итоговый квадратный размер в пикселях (16–4096) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Примечания {#notes}

- Вывод всегда в формате PNG для сохранения прозрачных углов (если только `background` не установлен на сплошной цвет).
- Круг вписывается в меньшее измерение изображения. Используйте `zoom` для более плотной обрезки и `offsetX`/`offsetY` для сдвига видимой области.
- Когда указан `outputSize`, результат изменяется до этого квадратного размера после обрезки.
- Входные данные HEIC, RAW, PSD и SVG автоматически декодируются перед обработкой.
