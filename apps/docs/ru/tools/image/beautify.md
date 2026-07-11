---
description: "Превращайте обычные скриншоты в отшлифованные изображения с градиентными фонами, рамками устройств, тенями и размерами для соцсетей."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: d7164ee48688
---

# Улучшение скриншота {#beautify-screenshot}

Добавляйте градиентные фоны, рамки устройств, тени, водяные знаки и размеры для соцсетей к скриншотам. Идеально подходит для создания отшлифованных изображений для маркетинга продуктов, соцсетей и документации.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Нет | `"linear-gradient"` | Тип фона: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | Нет | `"#667eea"` | Сплошной цвет фона (используется, когда `backgroundType` равен `solid`) |
| gradientStops | array | Нет | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Точки цветов градиента (мин. 2). У каждой точки есть `color` (hex) и `position` (0–100). |
| gradientAngle | number | Нет | 135 | Угол градиента в градусах (от 0 до 360) |
| padding | number | Нет | 64 | Отступ вокруг изображения в пикселях (от 0 до 256) |
| borderRadius | number | Нет | 12 | Радиус скругления углов скриншота (от 0 до 64) |
| shadowPreset | string | Нет | `"subtle"` | Пресет тени: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | Нет | 20 | Пользовательский радиус размытия тени (от 0 до 100, используется, когда `shadowPreset` равен `custom`) |
| shadowOffsetX | number | Нет | 0 | Пользовательское горизонтальное смещение тени (от -50 до 50) |
| shadowOffsetY | number | Нет | 10 | Пользовательское вертикальное смещение тени (от -50 до 50) |
| shadowColor | string | Нет | `"#000000"` | Пользовательский цвет тени в hex |
| shadowOpacity | number | Нет | 30 | Пользовательская непрозрачность тени (от 0 до 100) |
| frame | string | Нет | `"none"` | Рамка устройства или окна: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | Нет | - | Текст заголовка, отображаемый в строках заголовка рамки окна |
| socialPreset | string | Нет | `"none"` | Изменить размер под соцсети: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | Нет | - | Необязательный текст водяного знака |
| watermarkPosition | string | Нет | `"bottom-right"` | Положение водяного знака: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | Нет | 50 | Непрозрачность водяного знака (от 0 до 100) |
| outputFormat | string | Нет | `"png"` | Выходной формат: `png`, `jpeg`, `webp` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### С фоновым изображением {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Примечания {#notes}

- Принимает два файловых поля: `file` (обязательное, основной скриншот) и `backgroundImage` (необязательное, используется, когда `backgroundType` равен `image`).
- Поддерживает входные форматы HEIC, RAW, PSD и SVG (автоматически декодируются).
- Пресеты тени сопоставляются с определёнными значениями:
  - `subtle`: размытие 20, offsetY 4, непрозрачность 20%
  - `medium`: размытие 40, offsetY 10, непрозрачность 35%
  - `dramatic`: размытие 80, offsetY 20, непрозрачность 50%
- Пресеты для соцсетей изменяют размер итогового вывода под целевые размеры с использованием режима `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Рамки устройств (`iphone`, `macbook`, `ipad`) применяют аппаратную окантовку вокруг изображения и пропускают настройку `borderRadius`.
- Когда требуется прозрачность (тень, радиус скругления, рамки устройств или прозрачный фон), вывод принудительно устанавливается в PNG, даже если выбран `jpeg`.
- Фоновые изображения не поддерживаются в режиме конвейера/пакетной обработки.
