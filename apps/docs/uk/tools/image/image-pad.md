---
description: "Доповнює зображення до цільового співвідношення сторін суцільним кольором, прозорим або розмитим фоном."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: eec892888277
---

# Доповнення зображення {#image-pad}

Доповнюйте зображення до цільового співвідношення сторін, додаючи навколо нього суцільний колір, прозорий або розмитий фон. Корисно для підгонки зображень під фіксовані співвідношення сторін для соцмереж чи друку без обрізання.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Приймає дані форми multipart з файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| target | string | Ні | `"1:1"` | Цільове співвідношення сторін: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` або `custom` |
| ratioW | integer | Ні | `1` | Власна ширина співвідношення (1-100, використовується, коли target — `custom`) |
| ratioH | integer | Ні | `1` | Власна висота співвідношення (1-100, використовується, коли target — `custom`) |
| background | string | Ні | `"color"` | Режим фону: `color`, `transparent` або `blur` |
| color | string | Ні | `"#ffffff"` | Колір фону у форматі hex (коли background — `color`) |
| padding | integer | Ні | `0` | Додатковий відступ як відсоток полотна (0-50) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Примітки {#notes}

- Режим фону `blur` створює розмиту копію оригінального зображення як заповнення відступу, даючи візуально цілісний результат.
- Під час використання фону `transparent` вивід конвертується у PNG для збереження альфа-каналу.
- Формат виводу відповідає формату вводу, якщо не задіяна прозорість. Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
- Встановіть `target` у `custom` і вкажіть `ratioW` та `ratioH` для довільних співвідношень сторін (напр., `ratioW: 3, ratioH: 2` для 3:2).
