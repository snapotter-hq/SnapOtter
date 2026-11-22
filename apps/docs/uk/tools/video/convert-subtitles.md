---
description: "Конвертує файли субтитрів між SRT, WebVTT і ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: c98a90dab041
i18n_hash_version: 2
---

# Конвертація субтитрів {#convert-subtitles}

Конвертує файл субтитрів між SRT, WebVTT і ASS. Таймінги й текст зберігаються, а позиціювання та ефекти ASS не зберігаються.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Приймає багаточастинні дані форми з одним файлом субтитрів (`.srt`, `.vtt` або `.ass`) та необов’язковим полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Вихідний формат: `srt`, `vtt` або `ass` |
| `encoding` | string | `"auto"` | Кодування тексту вхідного файлу: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` або `euc-kr` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Примітки {#notes}

- Під час конвертації з ASS зберігаються таймінги, текст реплік і базове форматування, яке може передати цільовий формат: SRT зберігає курсив, напівжирний, колір і розмір шрифту як теги, WebVTT зберігає курсив, напівжирний і підкреслення. Позиціювання на екрані, анімація та інші ефекти ASS відкидаються.
- Вихідний файл завжди в UTF-8. Якщо `encoding` має значення `auto`, файл із коректним UTF-8 читається як є, а все інше читається як Windows-1252, звичайне кодування старих файлів SRT для західноєвропейських мов. Якщо символи з діакритикою чи нелатинські символи відображаються спотворено, вкажіть у `encoding` справжнє кодування файлу (наприклад, `gb18030` для спрощеної китайської або `windows-1251` для кирилиці).
- За замовчуванням завантаження субтитрів обмежене 1 МБ. Збільшити або зняти обмеження можна за допомогою `MAX_SUBTITLE_SIZE_MB`.
