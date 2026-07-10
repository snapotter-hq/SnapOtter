---
description: "Застосовуйте двоколірний ефект дуотон із власними кольорами тіней та світлих ділянок."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: fbbff6fd343f
---

# Duotone {#duotone}

Застосовуйте двоколірний ефект дуотон до зображення. Зображення перетворюється на відтінки сірого, а потім відображається на градієнт між кольором тіней (темні тони) та кольором світлих ділянок (яскраві тони).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Приймає дані форми multipart із файлом зображення та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| shadow | string | No | `"#1e3a8a"` | Hex-колір тіней (застосовується до темних тонів) |
| highlight | string | No | `"#fbbf24"` | Hex-колір світлих ділянок (застосовується до яскравих тонів) |
| intensity | integer | No | `100` | Інтенсивність ефекту (0-100); 0 повертає оригінал, 100 застосовує повний дуотон |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notes {#notes}

- Вихідний формат збігається з вхідним. Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
- `intensity` менша за 100 змішує результат дуотону з оригінальним зображенням, дозволяючи створювати м'якші ефекти.
- Популярні комбінації дуотону включають синій/золотий, бірюзовий/кораловий та фіолетовий/рожевий.
