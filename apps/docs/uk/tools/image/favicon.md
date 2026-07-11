---
description: "Генерує всі стандартні розміри favicon та іконок застосунку з вихідного зображення."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 72dc322c51fa
---

# Генератор favicon {#favicon-generator}

Створює повний набір файлів favicon та іконок застосунку з вихідного зображення. Генерує всі стандартні розміри, потрібні для браузерів, пристроїв Apple та Android, разом із вебманіфестом і фрагментом HTML.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Приймає дані форми multipart з одним або кількома файлами зображень та необовʼязковим полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| background | string | Ні | - | Колір фону у форматі hex (напр. `"#ffffff"`). Коли задано, іконку зводять на цей колір. |
| padding | integer | Ні | `0` | Відсоток відступу навколо вмісту іконки (від 0 до 40) |
| radius | integer | Ні | `0` | Відсоток радіуса кутів для округлених іконок (від 0 до 50) |
| sizes | integer[] | Ні | - | Обмежити вивід конкретними піксельними розмірами (напр. `[16, 32, 180]`). Пропустіть, щоб згенерувати всі стандартні розміри. |
| themeColor | string | Ні | `"#ffffff"` | Колір теми у форматі hex для вебманіфесту |

## Згенеровані файли {#generated-files}

Для кожного вхідного зображення створюються такі файли:

| Файл | Розмір | Призначення |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Іконка вкладки браузера |
| `favicon-32x32.png` | 32x32 | Іконка вкладки браузера (HiDPI) |
| `favicon-48x48.png` | 48x48 | Ярлик на робочому столі |
| `apple-touch-icon.png` | 180x180 | Головний екран iOS |
| `android-chrome-192x192.png` | 192x192 | Головний екран Android |
| `android-chrome-512x512.png` | 512x512 | Екран запуску Android |
| `favicon.ico` | 32x32 | Застарілий формат ICO |
| `manifest.json` | - | Маніфест вебзастосунку з посиланнями на іконки |
| `favicon-snippet.html` | - | Готові до використання теги link у HTML |

## Приклад запиту {#example-request}

Одне вихідне зображення з округленими кутами та відступом:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Кілька вихідних зображень (кожне отримує власний набір у підпапці):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Приклад відповіді {#example-response}

Відповідь — це ZIP-файл, який передається напряму. Заголовки відповіді такі:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Долучений фрагмент HTML {#html-snippet-included}

ZIP містить файл `favicon-snippet.html`, який можна вставити у `<head>` вашого HTML:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Примітки {#notes}

- Вихідні зображення масштабуються в режимі підгонки `cover`, тобто обрізаються, щоб заповнити кожен квадратний розмір. Для найкращого результату використовуйте квадратне вихідне зображення.
- Коли завантажено кілька файлів, кожен отримує власну підпапку в ZIP (названу за іменем вихідного файлу).
- Для завантаження одного файлу всі результати розміщуються в корені ZIP без підпапки.
- Файли, що не пройшли перевірку чи декодування, пропускаються, а до ZIP додається `skipped-files.txt` з поясненням проблем.
- Підтримувані вхідні формати: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD та інші.
- Орієнтація EXIF застосовується автоматично перед масштабуванням.
