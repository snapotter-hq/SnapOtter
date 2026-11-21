---
description: "Конвертація шрифтів між TTF, OTF, WOFF і WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: b219d97c0c6a
i18n_hash_version: 2
---

# Конвертація шрифтів {#convert-font}

Конвертує файл шрифту між форматами TrueType (TTF), OpenType CFF (OTF), WOFF і WOFF2. З його допомогою можна перетворити настільний шрифт на вебшрифт або отримати TTF з OTF для застосунку, який приймає лише TrueType.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Приймає дані форми у форматі multipart із файлом `.ttf`, `.otf`, `.woff` або `.woff2` та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| format | string | Ні | `ttf` | Вихідний формат: `ttf`, `otf`, `woff` або `woff2` |

## Приклад запиту {#example-request}

OTF у TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF у WOFF2 для вебу:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Примітки {#notes}

- WOFF і WOFF2 є стиснутими обгортками навколо тих самих даних шрифту, тому конвертація в ці формати чи з них не змінює контури.
- Конвертація OTF у TTF перетворює кубічні криві (CFF) на квадратичні криві TrueType. Кожна крива відхиляється від оригіналу не більше ніж на 1 одиницю шрифту, що непомітно за звичайних розмірів, але конвертація не є точно оборотною. Конвертація TTF у OTF зберігає форму кривих і лише округлює контрольні точки до цілих одиниць шрифту.
- Дозволи на вбудовування шрифту (поле OS/2 `fsType`) зберігаються без змін.
- Колекції шрифтів (`.ttc`) не підтримуються. Варіативні шрифти TrueType не можна конвертувати в OTF, а варіативні шрифти CFF2 не можна конвертувати в TTF; натомість конвертуйте їх у WOFF або WOFF2.
- Конвертація виконується в Python-воркері документів з тим самим тайм-аутом, що й інші інструменти для документів, а не в процесі API.
