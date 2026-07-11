---
description: "Ondertitels permanent in videoframes renderen."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 1333c762ddc9
---

# Burn Subtitles {#burn-subtitles}

Render (hardcode) ondertitels uit een SRT-, VTT- of ASS-bestand permanent in elk frame van een video.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Accepteert multipart form data met een videobestand en een ondertitelbestand. Dit is een async endpoint: het retourneert direct `202 Accepted` en de voortgang wordt via SSE gestreamd op `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| fontSize | integer | Nee | `24` | Lettergrootte van de ondertitels in pixels (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Upload twee bestanden: het eerste moet een video zijn, het tweede moet een ondertitelbestand zijn (.srt, .vtt of .ass).
- Ingebrande ondertitels zijn permanent onderdeel van de video en kunnen door de kijker niet worden uitgezet. Gebruik voor in- en uitschakelbare ondertitels in plaats daarvan de tool Embed Subtitles.
- Voortgangsupdates zijn beschikbaar via SSE op `GET /api/v1/jobs/{jobId}/progress` totdat de taak is voltooid.
