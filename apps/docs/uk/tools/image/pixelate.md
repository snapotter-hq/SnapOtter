---
description: "Застосуйте ефект пікселізації до всього зображення або конкретної області."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 56c99be0a923
---

# Пікселізація {#pixelate}

Застосуйте ефект пікселізації до всього зображення або конкретної прямокутної області. Корисно для приховування конфіденційного вмісту, як-от обличчя, номерні знаки чи особиста інформація.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Приймає дані форми multipart із файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| blockSize | integer | Ні | `12` | Розмір блока пікселів (2-128); більші значення дають грубшу пікселізацію |
| region | object | Ні | - | Обмежити пікселізацію прямокутником (див. нижче) |

### Об'єкт області {#region-object}

| Поле | Тип | Обов'язкове | Опис |
|-------|------|----------|-------------|
| left | integer | Так | Зміщення зліва в пікселях (>= 0) |
| top | integer | Так | Зміщення зверху в пікселях (>= 0) |
| width | integer | Так | Ширина області в пікселях (>= 1) |
| height | integer | Так | Висота області в пікселях (>= 1) |

## Приклад запиту {#example-request}

Пікселізувати все зображення:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Пікселізувати конкретну область:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Примітки {#notes}

- Коли `region` не вказано, пікселізується все зображення.
- Координати області вказуються в пікселях відносно верхнього лівого кута зображення. Область повинна знаходитися в межах зображення.
- Вихідний формат збігається з вхідним. Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
