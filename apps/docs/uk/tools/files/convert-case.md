---
description: "Змінює регістр тексту: ВЕЛИКІ, малі, Заголовок, як у реченні та інші."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: a5c0342cc13c
i18n_hash_version: 2
---

# Зміна регістру {#convert-case}

Вставте текст, виберіть регістр і скопіюйте результат. Текст надсилається лише на ваш власний сервер SnapOtter і більше нікуди.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Приймає тіло JSON, а не багаточастинні дані форми, і відповідає перетвореним текстом, а не файлом для завантаження.

## Параметри {#parameters}

| Назва | Тип | За замовчуванням | Опис |
|------|------|---------|-------------|
| `text` | string | (обов’язковий) | Текст для перетворення. До 1 000 000 символів. |
| `mode` | string | (обов’язковий) | Один із режимів нижче. |
| `locale` | string | (немає) | Мовний тег BCP 47, наприклад `tr` або `de`, для літер, регістр яких залежить від мови. Без нього регістр однаковий для всіх мов. |

| Режим | Вхід | Вихід |
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

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Приклад відповіді {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Примітки {#notes}

- `title` залишає короткі англійські слова (a, an, and, of, the, to та подібні) малими літерами, якщо вони не стоять на початку чи в кінці рядка. `capitalized` робить великою першу літеру кожного слова.
- `sentence` починає нове речення на початку тексту, після розриву рядка та після `.`, `!`, `?` або `…` з наступним пробілом, тому крапка в `snapotter.com` чи `3.5` не враховується.
- `camel`, `pascal`, `snake` і `kebab` розбивають текст за пробілами, розділовими знаками та наявними змінами регістру (`XMLHttpRequest` стає `xml_http_request`) і перетворюють кожен рядок окремо.
- Якщо `locale` має значення `tr`, `i` у верхньому регістрі стає `İ`, а `I` у нижньому регістрі стає `ı`. Німецька `ß` у верхньому регістрі стає `SS` в усіх локалях.
- Вебзастосунок передає поточну мову інтерфейсу як `locale`.
