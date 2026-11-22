---
description: "Смена регистра текста: ВЕРХНИЙ, нижний, Заголовок, как в предложении и другие."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: b60b4fd3f808
i18n_hash_version: 2
---

# Смена регистра {#convert-case}

Вставьте текст, выберите регистр и скопируйте результат. Текст отправляется только на ваш собственный сервер SnapOtter и больше никуда.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Принимает тело JSON, а не multipart form data, и отвечает преобразованным текстом, а не файлом для загрузки.

## Параметры {#parameters}

| Имя | Тип | По умолчанию | Описание |
|------|------|---------|-------------|
| `text` | string | (обязательный) | Текст для преобразования. До 1 000 000 символов. |
| `mode` | string | (обязательный) | Один из режимов ниже. |
| `locale` | string | (нет) | Языковой тег BCP 47, например `tr` или `de`, для букв, регистр которых зависит от языка. Без него регистр одинаков для всех языков. |

| Режим | Вход | Выход |
|-------|------|-------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Пример ответа {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Примечания {#notes}

- `title` оставляет короткие английские слова (a, an, and, of, the, to и подобные) строчными, если они не стоят в начале или конце строки. `capitalized` делает заглавной первую букву каждого слова.
- `sentence` начинает новое предложение в начале текста, после переноса строки и после `.`, `!`, `?` или `…` с последующим пробелом, поэтому точка в `snapotter.com` или `3.5` не учитывается.
- `camel`, `pascal`, `snake` и `kebab` разбивают текст по пробелам, знакам препинания и существующим сменам регистра (`XMLHttpRequest` превращается в `xml_http_request`) и преобразуют каждую строку отдельно.
- Если `locale` равно `tr`, `i` переводится в верхний регистр как `İ`, а `I` переводится в нижний регистр как `ı`. Немецкая `ß` переводится в верхний регистр как `SS` во всех локалях.
- Веб-приложение передаёт текущий язык интерфейса как `locale`.
