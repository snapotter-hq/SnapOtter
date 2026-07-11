---
description: "Lägg en logotyp eller bild som vattenstämpel med konfigurerbar position, opacitet och skala."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 8697010cf3c4
---

# Bildvattenstämpel {#image-watermark}

Lägg en logotyp eller sekundär bild som vattenstämpel på en basbild. Vattenstämpeln skalas i förhållande till basbildens bredd och placeras i ett hörn eller i mitten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Tar emot multipart-formulärdata med **två** bildfiler och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | Placering av vattenstämpel: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | Vattenstämpelns opacitet i procent (0 till 100) |
| scale | number | No | `25` | Vattenstämpelns bredd som procent av huvudbildens bredd (1 till 100) |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | Huvud-/basbilden |
| watermark | Yes | Vattenstämpel-/logotypbilden |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notes {#notes}

- Båda bilderna valideras och avkodas (HEIC, RAW, PSD, SVG stöds).
- Vattenstämpeln storleksändras proportionellt så att dess bredd är lika med `scale` % av huvudbildens bredd.
- Opacitet tillämpas via en alfamask som komponeras med blandning `dest-in`.
- Hörnpositioner använder en 20px utfyllnad från bildkanten.
- Om vattenstämpelbilden har transparens (t.ex. en PNG-logotyp) bevaras den under komponeringen.
- EXIF-orientering tillämpas automatiskt på båda bilderna före bearbetning.
