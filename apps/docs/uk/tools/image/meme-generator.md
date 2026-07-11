---
description: "Створюйте меми за допомогою шаблонів або власних зображень, стилізованих текстових блоків і варіантів шрифтів."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 1e719477cf0f
---

# Генератор мемів {#meme-generator}

Створюйте меми, використовуючи вбудовані шаблони або власні зображення. Додавайте текст із класичним стилем мемів (жирний, обведений текст), кількома пресетами макетів і вибором шрифтів.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Приймає одне з двох:
- **Дані форми multipart** із файлом зображення та полем JSON `settings` (режим власного зображення)
- **Тіло JSON** із `templateId` (режим шаблону, завантаження файлу не потрібне)

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| templateId | string | Ні | - | ID вбудованого шаблону мема. Якщо вказано, завантаження зображення не потрібне |
| textLayout | string | Ні | `"top-bottom"` | Макет текстових блоків: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Ні | `[]` | Масив об'єктів текстових блоків із полями `id` та `text` |
| fontFamily | string | Ні | `"anton"` | Шрифт: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Ні | auto | Розмір шрифту в пікселях (від 8 до 200). Обчислюється автоматично, якщо не вказано |
| textColor | string | Ні | `"#ffffff"` | Колір заливки тексту |
| strokeColor | string | Ні | `"#000000"` | Колір обведення/контуру тексту |
| textAlign | string | Ні | `"center"` | Вирівнювання тексту: `left`, `center`, `right` |
| allCaps | boolean | Ні | `true` | Перетворити текст у верхній регістр |

### Текстові блоки {#text-boxes}

Кожен запис у масиві `textBoxes` повинен мати:

| Поле | Тип | Опис |
|-------|------|-------------|
| id | string | Ідентифікатор блока, що відповідає макету (наприклад, `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Текст мема для відображення |

### ID блоків макета тексту {#text-layout-box-ids}

| Макет | Доступні ID блоків |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Приклад запиту {#example-request}

Власне зображення з верхнім і нижнім текстом:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Використання вбудованого шаблону (тіло JSON, без завантаження файлу):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Примітки {#notes}

- Потрібен або `templateId`, або завантажений файл зображення. Якщо вказати обидва, використовується шаблон.
- Шаблони визначають власні позиції текстових блоків; параметр `textLayout` ігнорується при використанні шаблонів.
- Текст рендериться як SVG з обведеними контурами для класичного вигляду мема.
- Розмір шрифту обчислюється автоматично, щоб вписатися в текстовий блок, якщо його не задано явно.
- Порожні текстові блоки пропускаються (рендеринг не відбувається, якщо всі блоки порожні).
- Ім'я вихідного файлу містить ID шаблону при використанні шаблонів (наприклад, `meme-drake.png`).
- Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
