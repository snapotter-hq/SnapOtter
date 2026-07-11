---
description: "Een video roteren of spiegelen."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 2c414d60c25c
---

# Rotate Video {#rotate-video}

Roteer een video 90, 180 of 270 graden, of spiegel hem horizontaal of verticaal.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| transform | string | Ja | - | Toe te passen transformatie: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - 90 graden met de klok mee roteren
- **ccw90** - 90 graden tegen de klok in roteren
- **180** - 180 graden roteren
- **hflip** - Horizontaal spiegelen (mirror)
- **vflip** - Verticaal spiegelen

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Rotaties van 90 of 270 graden verwisselen de breedte en hoogte van de video.
- Spiegelbewerkingen (hflip, vflip) veranderen de videoafmetingen niet.
