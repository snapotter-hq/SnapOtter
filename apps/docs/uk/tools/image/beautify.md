---
description: "Перетворення простих знімків екрана на відшліфовані зображення з градієнтними фонами, рамками пристроїв, тінями та розмірами для соціальних мереж."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: b18161b63c04
---

# Прикрашання знімка екрана {#beautify-screenshot}

Додавання градієнтних фонів, рамок пристроїв, тіней, водяних знаків та розмірів для соціальних мереж до знімків екрана. Ідеально для створення відшліфованих зображень для маркетингу продукту, соціальних мереж та документації.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Ні | `"linear-gradient"` | Тип фону: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | Ні | `"#667eea"` | Суцільний колір фону (використовується, коли `backgroundType` має значення `solid`) |
| gradientStops | array | Ні | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Точки зупинки кольору градієнта (мінімум 2). Кожна точка має `color` (hex) та `position` (0-100). |
| gradientAngle | number | Ні | 135 | Кут градієнта у градусах (0 до 360) |
| padding | number | Ні | 64 | Відступ навколо зображення в пікселях (0 до 256) |
| borderRadius | number | Ні | 12 | Радіус кутів на знімку екрана (0 до 64) |
| shadowPreset | string | Ні | `"subtle"` | Пресет тіні: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | Ні | 20 | Користувацький радіус розмиття тіні (0 до 100, використовується, коли `shadowPreset` має значення `custom`) |
| shadowOffsetX | number | Ні | 0 | Користувацький горизонтальний зсув тіні (-50 до 50) |
| shadowOffsetY | number | Ні | 10 | Користувацький вертикальний зсув тіні (-50 до 50) |
| shadowColor | string | Ні | `"#000000"` | Користувацький колір тіні як hex |
| shadowOpacity | number | Ні | 30 | Користувацька непрозорість тіні (0 до 100) |
| frame | string | Ні | `"none"` | Рамка пристрою або вікна: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | Ні | - | Текст заголовка, що відображається в рядках заголовка рамок вікон |
| socialPreset | string | Ні | `"none"` | Зміна розміру до розмірів соціальних мереж: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | Ні | - | Необов'язкове накладання тексту водяного знака |
| watermarkPosition | string | Ні | `"bottom-right"` | Положення водяного знака: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | Ні | 50 | Непрозорість водяного знака (0 до 100) |
| outputFormat | string | Ні | `"png"` | Вихідний формат: `png`, `jpeg`, `webp` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### З фоновим зображенням {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Примітки {#notes}

- Приймає два поля файлів: `file` (обов'язкове, основний знімок екрана) та `backgroundImage` (необов'язкове, використовується, коли `backgroundType` має значення `image`).
- Підтримує вхідні формати HEIC, RAW, PSD та SVG (автоматично декодуються).
- Пресети тіней зіставляються з конкретними значеннями:
  - `subtle`: розмиття 20, offsetY 4, непрозорість 20%
  - `medium`: розмиття 40, offsetY 10, непрозорість 35%
  - `dramatic`: розмиття 80, offsetY 20, непрозорість 50%
- Пресети соціальних мереж змінюють розмір кінцевого виводу під цільові розміри в режимі `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Рамки пристроїв (`iphone`, `macbook`, `ipad`) застосовують апаратну окантовку навколо зображення та пропускають налаштування `borderRadius`.
- Коли потрібна прозорість (тінь, радіус кутів, рамки пристроїв або прозорий фон), вивід примусово встановлюється у PNG, навіть якщо обрано `jpeg`.
- Фонові зображення не підтримуються в режимі конвеєра/пакетної обробки.
