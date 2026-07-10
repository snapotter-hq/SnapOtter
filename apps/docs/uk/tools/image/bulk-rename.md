---
description: "Перейменування кількох файлів за шаблоном та завантаження у вигляді ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 5673adbcb720
---

# Масове перейменування {#bulk-rename}

Перейменування кількох файлів за шаблоном із заповнювачами для індексу, доповненого індексу та початкового імені файлу. Повертає архів ZIP з усіма перейменованими файлами.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Приймає дані форми у форматі multipart із кількома файлами та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| pattern | string | Ні | `"image-{{index}}"` | Шаблон іменування із заповнювачами (макс. 1000 символів) |
| startIndex | number | Ні | `1` | Початковий номер індексу |

### Заповнювачі шаблону {#pattern-placeholders}

| Заповнювач | Опис | Приклад |
|-------------|-------------|---------|
| `{{index}}` | Послідовний номер, починаючи з `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Послідовний номер, доповнений нулями | `01`, `02`, `03` |
| `{{original}}` | Початкове ім'я файлу без розширення | `photo`, `IMG_001` |

Початкове розширення файлу завжди зберігається.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Це дає: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Використання початкового імені файлу:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Це дає: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Приклад відповіді {#example-response}

Відповідь є файлом ZIP, що передається безпосередньо (не відповіддю JSON). Заголовки відповіді:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Примітки {#notes}

- Цей інструмент не обробляє зображення. Він лише перейменовує файли та пакує їх в архів ZIP.
- Ширина доповнення нулями для `{{padded}}` визначається автоматично на основі загальної кількості файлів (наприклад, 100 файлів використовуватимуть 3-значне доповнення: `001`, `002` тощо).
- Розширення файлів зберігаються з початкових імен файлів.
- Імена файлів очищаються від небезпечних символів.
- Потрібно надати принаймні один файл.
