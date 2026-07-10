---
description: "Зменшуйте розмір файлу зображення за рівнем якості або до цільового розміру файлу."
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: 18cb8eab28be
---

# Compress {#compress}

Зменшуйте розмір файлу зображення, вказавши рівень якості або цільовий розмір файлу в кілобайтах. Інструмент використовує ітеративний двійковий пошук для точного досягнення цільового розміру.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compress`

Приймає дані форми multipart із файлом зображення та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Режим стиснення: `quality` або `targetSize` |
| quality | number | No | `80` | Рівень якості (1-100). Використовується, коли режим `quality`. |
| targetSizeKb | number | No | - | Цільовий розмір файлу в кілобайтах. Використовується, коли режим `targetSize`. |

## Example Request {#example-request}

Стиснути до якості 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Стиснути до цільового розміру 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notes {#notes}

- У режимі `quality` нижчі значення дають менші файли з більшою кількістю артефактів стиснення. Значення 80 є хорошим за замовчуванням для веб-використання.
- У режимі `targetSize` рушій виконує ітеративне стиснення, щоб максимально наблизитися до цільового розміру, не перевищуючи його.
- Вихідний формат збігається з вхідним. Стиснення застосовується до власного кодування формату (напр. якість JPEG для файлів JPEG, якість WebP для файлів WebP).
- Якщо якість за замовчуванням (80) прийнятна, ви можете повністю опустити параметр `quality`.
