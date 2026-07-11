---
description: "De framerate van een video wijzigen."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 2f397c66c881
---

# Change FPS {#change-fps}

Wijzig de framerate van een video naar een doelwaarde tussen 1 en 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| fps | number | Nee | `30` | Doelframerate (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Een lagere framerate laat frames vallen en verkleint de bestandsgrootte. Een hogere framerate dupliceert frames om het gat op te vullen, maar voegt geen echte bewegingsdetails toe.
- Gebruikelijke doelwaarden: 24 (cinema), 30 (web/broadcast), 60 (vloeiende weergave).
- Het audiospoor blijft op de oorspronkelijke samplerate behouden.
