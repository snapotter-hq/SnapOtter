---
description: "Конвертация анимированного GIF в WebP и обратно с сохранением всех кадров."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: e6785673e70c
---

# Конвертер GIF/WebP {#gif-webp-converter}

Конвертируйте анимированные GIF-файлы в WebP и обратно, сохраняя все кадры и тайминг анимации. Анимации WebP обычно на 25-35% меньше эквивалентных GIF.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Принимает данные формы multipart с файлом GIF или WebP и полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| quality | integer | Нет | `80` | Качество вывода для кодирования WebP (1-100) |
| lossless | boolean | Нет | `false` | Использовать сжатие WebP без потерь |
| resizePercent | integer | Нет | `100` | Масштабировать вывод в процентах (10-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Примечания {#notes}

- Принимаются только файлы `.gif` и `.webp`. Другие форматы изображений этот инструмент не поддерживает.
- Направление конвертации определяется автоматически: вход GIF даёт выход WebP, а вход WebP даёт выход GIF.
- Параметры `quality` и `lossless` применяются только при кодировании в WebP. При конвертации в GIF вывод использует стандартную палитру GIF.
- Используйте `resizePercent`, чтобы уменьшить размеры (и объём файла) больших анимаций.
