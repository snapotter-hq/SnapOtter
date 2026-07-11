---
description: "Разворот аудиофайла, чтобы он воспроизводился в обратном направлении."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 55fec343eb1d
---

# Разворот аудио {#reverse-audio}

Разверните аудиофайл, чтобы он воспроизводился в обратном направлении.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Принимает данные формы multipart с аудиофайлом и полем `settings` в формате JSON.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Разворачивается весь аудиофайл.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Примечания {#notes}

- Полная аудиодорожка разворачивается с конца к началу.
- Вывод обычно сохраняет входной контейнер. Вход AAC записывается как M4A, а неподдерживаемые для декодирования входы откатываются к MP3.
