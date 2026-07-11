---
description: "Конвертуйте зображення в data URI у форматі base64 для вбудовування в HTML, CSS тощо."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: dd739347bafc
---

# Зображення в Base64 {#image-to-base64}

Конвертуйте одне або кілька зображень у рядки, закодовані в base64, та data URI. Підтримує необовʼязкову конвертацію формату, контроль якості та зміну розміру. Корисно для вбудовування зображень напряму в HTML, CSS, JSON або шаблони листів.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Приймає дані форми multipart з одним або кількома файлами зображень та необовʼязковим полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Ні | `"original"` | Конвертувати перед кодуванням: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Ні | `80` | Якість виводу для форматів із втратами (від 1 до 100) |
| maxWidth | number | Ні | `0` | Максимальна ширина в пікселях (0 = без зміни розміру, не збільшуватиме) |
| maxHeight | number | Ні | `0` | Максимальна висота в пікселях (0 = без зміни розміру, не збільшуватиме) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Кілька файлів:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Приклад відповіді {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Поля відповіді {#response-fields}

| Поле | Тип | Опис |
|-------|------|-------------|
| results | array | Успішно конвертовані зображення |
| errors | array | Зображення, які не вдалося обробити (з іменем файлу та повідомленням про помилку) |

### Обʼєкт result {#result-object}

| Поле | Тип | Опис |
|-------|------|-------------|
| filename | string | Оригінальне імʼя файлу |
| mimeType | string | MIME-тип закодованого виводу |
| width | number | Кінцева ширина в пікселях (після будь-якої зміни розміру) |
| height | number | Кінцева висота в пікселях (після будь-якої зміни розміру) |
| originalSize | number | Оригінальний розмір файлу в байтах |
| encodedSize | number | Розмір рядка base64 в байтах |
| overheadPercent | number | Відсоткова різниця в розмірі порівняно з оригіналом (додатне = більше, відʼємне = менше) |
| base64 | string | Сирі дані зображення, закодовані в base64 |
| dataUri | string | Повний data URI, готовий до використання в атрибутах `src` |

## Примітки {#notes}

- Кодування base64 зазвичай збільшує розмір приблизно на 33% порівняно з бінарним файлом. Поле `overheadPercent` показує фактичну різницю.
- Коли `outputFormat` — `"original"`, файли HEIC/HEIF конвертуються в JPEG (оскільки браузери не можуть показувати HEIC у data URI).
- Параметри `maxWidth` та `maxHeight` змінюють розмір за допомогою `fit: inside` з `withoutEnlargement`, тож зображення, менші за вказані розміри, не збільшуються.
- В одному запиті можна обробити кілька файлів. Кожен файл обробляється незалежно, і збої не заважають успішній обробці інших файлів.
- Файли SVG передаються як `image/svg+xml` без повторного кодування (якщо не запитано конвертацію формату).
- Це кінцевий пункт лише для читання. Він не створює завантажуваного файлу чи `jobId`. Дані base64 повертаються напряму в тілі відповіді.
