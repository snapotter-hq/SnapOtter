---
description: "Генерация файлов субтитров из аудиодорожек видео с помощью ИИ."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 2c0dc2a5108a
---

# Auto Subtitles {#auto-subtitles}

Сгенерируйте файлы субтитров из аудиодорожки видео с помощью распознавания речи на базе ИИ (faster-whisper). Поддерживает автоопределение и 10 явных языков.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Принимает данные multipart form с видеофайлом и JSON-полем `settings`. Это асинхронный endpoint - он немедленно возвращает `202 Accepted`, а прогресс передаётся через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| language | string | Нет | `"auto"` | Язык речи: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | Нет | `"srt"` | Выходной формат субтитров: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Это инструмент ИИ, требующий установленного пакета функций **transcription**. Если пакет не установлен, API возвращает `501 Feature Not Installed` с инструкциями по его установке через интерфейс администратора.
- Языковой параметр `auto` использует встроенное определение языка в whisper. Явное указание языка повышает точность и скорость.
- SRT является наиболее широко поддерживаемым форматом субтитров. VTT (WebVTT) является стандартом для веб-плееров видео.
- Обновления прогресса доступны через SSE по адресу `GET /api/v1/jobs/{jobId}/progress` до завершения задания.
