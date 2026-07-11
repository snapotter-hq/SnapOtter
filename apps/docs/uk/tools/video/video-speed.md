---
description: "Прискорює або сповільнює відео."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 3f27161c0020
---

# Video Speed {#video-speed}

Прискорює або сповільнює відео з можливістю збереження висоти тону аудіо.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Множник швидкості (0.25-4). Значення вище 1 прискорюють, нижче 1 сповільнюють |
| keepPitch | boolean | No | `true` | Зберігати висоту тону аудіо при зміні швидкості |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Множник `2` подвоює швидкість відтворення (удвічі скорочує тривалість). Множник `0.5` удвічі сповільнює відтворення (подвоює тривалість).
- Коли `keepPitch` дорівнює `true`, аудіо розтягується в часі так, що голоси звучать природно. Коли `false`, висота тону зміщується пропорційно швидкості.
- Допустимий діапазон - від 0.25x до 4x.
