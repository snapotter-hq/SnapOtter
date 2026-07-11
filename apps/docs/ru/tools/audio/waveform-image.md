---
description: "Создание визуализации формы волны в виде изображения PNG из аудиофайла."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 32a468627add
---

# Изображение формы волны {#waveform-image}

Создание визуализации формы волны в виде изображения PNG из аудиофайла с настраиваемыми размерами и цветом.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Принимает multipart form data с аудиофайлом и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| width | integer | Нет | `1024` | Ширина изображения в пикселях (от 256 до 3840) |
| height | integer | Нет | `256` | Высота изображения в пикселях (от 64 до 1080) |
| color | string | Нет | `"#4f46e5"` | Шестнадцатеричный цвет формы волны (например, `"#4f46e5"`) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Примечания {#notes}

- Выходной файл всегда является изображением PNG независимо от формата входного аудио.
- Форма волны отрисовывается на прозрачном фоне.
- Полезно для миниатюр, превью для соцсетей или встраивания в веб-страницы.
