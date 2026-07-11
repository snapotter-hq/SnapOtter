---
description: "Заповнення смуг розмитою копією відео."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 90e2ef531bad
---

# Blur Pad {#blur-pad}

Впишіть відео в цільове співвідношення сторін, заповнюючи область заповнення розмитою масштабованою копією відео замість суцільнокольорових смуг.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Приймає багаточастинні (multipart) дані форми з відеофайлом та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | Цільове співвідношення сторін: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | Сигма гаусового розмиття для фону (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Вищі значення розмиття дають м'якший, абстрактніший фон. Нижчі значення зберігають більше видимих деталей.
- Якщо відео вже відповідає цільовому співвідношенню сторін, файл повертається без змін.
- Для суцільнокольорового заповнення використовуйте натомість інструмент Aspect Pad.
