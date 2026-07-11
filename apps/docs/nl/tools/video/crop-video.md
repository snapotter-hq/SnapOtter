---
description: "Een gebied uit een video bijsnijden."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 5724d681ae43
---

# Crop Video {#crop-video}

Snijd een rechthoekig gebied uit een video bij door de grootte en positie van het gebied op te geven.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| width | integer | Ja | - | Breedte van het bijsnijdgebied in pixels (minimaal 16) |
| height | integer | Ja | - | Hoogte van het bijsnijdgebied in pixels (minimaal 16) |
| x | integer | Nee | `0` | Horizontale verschuiving vanaf de linkerbovenhoek |
| y | integer | Nee | `0` | Verticale verschuiving vanaf de linkerbovenhoek |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- Het bijsnijdgebied moet binnen de videoafmetingen passen. Als `x + width` of `y + height` de brongrootte overschrijdt, geeft het verzoek een 400-fout terug.
- De minimale bijsnijdgrootte is 16x16 pixels.
- Afmetingen worden afgerond op even getallen, zoals de meeste videocodecs vereisen.
