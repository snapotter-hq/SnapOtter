---
description: "Verhoog of verlaag het audiovolume met een vaste versterking in decibel."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 43dca36f14df
---

# Volume aanpassen {#volume-adjust}

Verhoog of verlaag het volume van een audiobestand door een vaste versterking in decibel toe te passen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Accepteert multipart-formulierdata met een audiobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| gainDb | number | Nee | `3` | Volumeaanpassing in decibel (-30 tot 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Positieve waarden verhogen het volume; negatieve waarden verlagen het.
- Grote positieve versterkingen kunnen clipping veroorzaken. Gebruik normalize-audio voor luidheidsveilige nivellering.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt weggeschreven als M4A, en niet-ondersteunde decodeer-alleen-invoer valt terug op MP3.
