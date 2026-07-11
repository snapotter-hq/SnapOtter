---
description: "Змінюйте розмір, оптимізуйте, змінюйте швидкість, реверсуйте, обертайте та витягуйте кадри з анімованих GIF в одному інструменті."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 43dbcd5be0be
---

# GIF Tools {#gif-tools}

Змінюйте розмір, оптимізуйте, змінюйте швидкість, реверсуйте, витягуйте кадри та обертайте анімовані GIF. Надає кілька режимів роботи в одному інструменті.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Параметри {#parameters}

### Загальні параметри {#common-parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| mode | string | Ні | `"resize"` | Режим роботи: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Ні | 0 | Кількість повторів вихідного GIF (0 = нескінченно, 1-100 = скінченна кількість повторів) |

### Параметри режиму зміни розміру {#resize-mode-parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| width | integer | Ні | - | Цільова ширина в пікселях (від 1 до 16384) |
| height | integer | Ні | - | Цільова висота в пікселях (від 1 до 16384) |
| percentage | number | Ні | - | Масштабувати у відсотках (від 1 до 500). Замінює width/height, якщо задано. |

### Параметри режиму оптимізації {#optimize-mode-parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| colors | number | Ні | 256 | Максимальна кількість кольорів у палітрі (від 2 до 256) |
| dither | number | Ні | 1.0 | Сила дизерингу (від 0 до 1, де 0 вимикає дизеринг) |
| effort | number | Ні | 7 | Рівень зусиль оптимізації (від 1 до 10, вище = повільніше, але менше) |

### Параметри режиму швидкості {#speed-mode-parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Ні | 1.0 | Множник швидкості (від 0.1 до 10). Значення > 1 прискорюють, < 1 сповільнюють. |

### Параметри режиму витягування {#extract-mode-parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| extractMode | string | Ні | `"single"` | Режим витягування: `single`, `range`, `all` |
| frameNumber | number | Ні | 0 | Індекс кадру для витягування в режимі `single` (з нуля) |
| frameStart | number | Ні | 0 | Індекс початкового кадру для режиму `range` (з нуля) |
| frameEnd | number | Ні | - | Індекс кінцевого кадру для режиму `range` (з нуля, включно) |
| extractFormat | string | Ні | `"png"` | Формат витягнутих кадрів: `png`, `webp` |

### Параметри режиму обертання {#rotate-mode-parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| angle | number | Ні | - | Кут обертання: `90`, `180` або `270` градусів |
| flipH | boolean | Ні | `false` | Віддзеркалити по горизонталі |
| flipV | boolean | Ні | `false` | Віддзеркалити по вертикалі |

## Приклади запитів {#example-requests}

### Зміна розміру {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Оптимізація {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Прискорення {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Витягування одного кадру {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Підмаршрут Info {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Повертає метадані про анімований GIF без його обробки.

### Запит Info {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Відповідь Info {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Примітки {#notes}

- Для основного кінцевого пункту обробки використовує стандартну фабрику `createToolRoute`.
- Кінцевий пункт info вимагає лише завантаження файлу (налаштування не потрібні).
- У режимі `resize`, якщо задано `percentage`, воно має пріоритет над `width`/`height`. Зміна розміру використовує `fit: inside` для збереження співвідношення сторін.
- У режимі `speed` затримки кадрів діляться на коефіцієнт швидкості. Мінімальна затримка на кадр — 20ms (обмеження специфікації GIF).
- У режимі `reverse` також доступний параметр `speedFactor` для одночасного регулювання швидкості під час реверсування.
- У режимі `extract` з `range` або `all` вивід — це ZIP-файл, що містить окремі кадри.
- У режимі `rotate` кожен кадр обробляється окремо та знову складається в анімацію.
- Параметр `loop` контролює, скільки разів повторюється вихідний GIF. Використовуйте 0 для нескінченного повторення.
- Поле `duration` у відповіді info — це загальна тривалість анімації в мілісекундах.
