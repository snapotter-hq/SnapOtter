---
description: "Конвертация файлов субтитров между SRT, WebVTT и ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 93329cee9f75
i18n_hash_version: 2
---

# Конвертация субтитров {#convert-subtitles}

Конвертация файла субтитров между SRT, WebVTT и ASS. Тайминги и текст сохраняются, а позиционирование и эффекты ASS не сохраняются.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Принимает multipart form data с одним файлом субтитров (`.srt`, `.vtt` или `.ass`) и необязательным JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Выходной формат: `srt`, `vtt` или `ass` |
| `encoding` | string | `"auto"` | Кодировка текста входного файла: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` или `euc-kr` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Примечания {#notes}

- При конвертации из ASS сохраняются тайминги, текст реплик и базовое форматирование, которое поддерживает целевой формат: SRT сохраняет курсив, полужирный, цвет и размер шрифта в виде тегов, WebVTT сохраняет курсив, полужирный и подчёркивание. Позиционирование на экране, анимация и другие эффекты ASS отбрасываются.
- Выходной файл всегда в UTF-8. Если `encoding` имеет значение `auto`, файл с корректным UTF-8 читается как есть, а всё остальное читается как Windows-1252, обычная кодировка старых файлов SRT для западноевропейских языков. Если символы с диакритикой или нелатинские символы отображаются искажённо, укажите в `encoding` настоящую кодировку файла (например, `gb18030` для упрощённого китайского или `windows-1251` для кириллицы).
- По умолчанию загружаемые файлы субтитров ограничены 1 МБ. Увеличить или снять ограничение можно с помощью `MAX_SUBTITLE_SIZE_MB`.
