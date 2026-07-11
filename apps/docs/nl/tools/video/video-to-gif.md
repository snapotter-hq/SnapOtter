---
description: "Een videoclip omzetten naar een geanimeerde GIF."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 4591c3e30255
---

# Video to GIF {#video-to-gif}

Zet een videoclip om naar een geanimeerde GIF met een instelbare framerate, breedte, starttijd en duur.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`. Dit is een async endpoint: het retourneert direct `202 Accepted` en de voortgang wordt via SSE gestreamd op `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| fps | integer | Nee | `12` | Uitvoerframerate (1-30) |
| width | integer | Nee | `480` | Uitvoerbreedte in pixels (64-1280). De hoogte schaalt proportioneel mee |
| startS | number | Nee | `0` | Starttijd in seconden (moet >= 0 zijn) |
| durationS | number | Nee | `5` | Duur in seconden (boven 0, max 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Lagere waarden voor `fps` en `width` produceren kleinere GIF-bestanden. Een GIF van 480px breed op 12 fps is meestal een goede balans.
- De maximale duur is 60 seconden. Langere clips produceren zeer grote bestanden.
- Voortgangsupdates zijn beschikbaar via SSE op `GET /api/v1/jobs/{jobId}/progress` totdat de taak is voltooid.
