---
description: "Genereer een golfvormvisualisatie als een PNG-afbeelding uit een audiobestand."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 4f317f4f3b35
---

# Waveform Image {#waveform-image}

Genereer een golfvormvisualisatie als een PNG-afbeelding uit een audiobestand, met instelbare afmetingen en kleur.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Accepteert multipart-formulierdata met een audiobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| width | integer | Nee | `1024` | Afbeeldingsbreedte in pixels (256 tot 3840) |
| height | integer | Nee | `256` | Afbeeldingshoogte in pixels (64 tot 1080) |
| color | string | Nee | `"#4f46e5"` | Hexkleur van de golfvorm (bijv. `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- De uitvoer is altijd een PNG-afbeelding, ongeacht het audioformaat van de invoer.
- De golfvorm wordt weergegeven op een transparante achtergrond.
- Handig voor thumbnails, previews voor sociale media of insluiten in webpagina's.
