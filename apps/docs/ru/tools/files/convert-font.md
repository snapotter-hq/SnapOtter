---
description: "Конвертация шрифтов между TTF, OTF, WOFF и WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 2cbdcad6253c
i18n_hash_version: 2
---

# Конвертация шрифтов {#convert-font}

Конвертирует файл шрифта между форматами TrueType (TTF), OpenType CFF (OTF), WOFF и WOFF2. С его помощью можно превратить настольный шрифт в веб-шрифт или получить TTF из OTF для приложения, которое принимает только TrueType.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Принимает multipart form data с файлом `.ttf`, `.otf`, `.woff` или `.woff2` и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Нет | `ttf` | Выходной формат: `ttf`, `otf`, `woff` или `woff2` |

## Пример запроса {#example-request}

OTF в TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF в WOFF2 для веба:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Примечания {#notes}

- WOFF и WOFF2 представляют собой сжатые обёртки вокруг тех же данных шрифта, поэтому конвертация в эти форматы и из них не меняет контуры.
- Конвертация OTF в TTF превращает кубические кривые (CFF) в квадратичные кривые TrueType. Каждая кривая отклоняется от оригинала не больше чем на 1 единицу шрифта, что незаметно при обычных размерах, но конвертация не является точно обратимой. Конвертация TTF в OTF сохраняет форму кривых и только округляет контрольные точки до целых единиц шрифта.
- Права на встраивание шрифта (поле OS/2 `fsType`) сохраняются без изменений.
- Коллекции шрифтов (`.ttc`) не поддерживаются. Вариативные шрифты TrueType нельзя конвертировать в OTF, а вариативные шрифты CFF2 нельзя конвертировать в TTF; вместо этого конвертируйте их в WOFF или WOFF2.
- Конвертация выполняется в Python-воркере документов с тем же тайм-аутом, что и у других инструментов для документов, а не в процессе API.
