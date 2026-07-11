---
description: "Регулює яскравість, контраст, насиченість і гаму відео."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: afe49a72f359
---

# Video Color {#video-color}

Регулює яскравість, контраст, насиченість і гамма-корекцію відео.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Регулювання яскравості (-1 до 1) |
| contrast | number | No | `1` | Множник контрасту (0-4) |
| saturation | number | No | `1` | Множник насиченості (0-3). Встановіть 0 для відтінків сірого |
| gamma | number | No | `1` | Гамма-корекція (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Усі значення за замовчуванням (яскравість 0, контраст 1, насиченість 1, гама 1) не дають жодних змін.
- Встановлення насиченості в `0` перетворює відео на відтінки сірого.
- Значення гами нижче 1 висвітлюють тіні, тоді як значення вище 1 їх затемнюють.
