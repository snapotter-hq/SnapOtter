---
description: "Meerdere videoclips samenvoegen tot één bestand."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 7224a9a029ee
---

# Merge Videos {#merge-videos}

Voeg meerdere videoclips samen tot één MP4-bestand. Alle invoer wordt genormaliseerd naar de resolutie van de eerste video en 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Accepteert multipart form data met twee of meer videobestanden. Dit is een async endpoint: het retourneert direct `202 Accepted` en de voortgang wordt via SSE gestreamd op `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

Deze tool heeft geen instellingsparameters. Upload 2-10 videobestanden als meerdere `file`-delen.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Clips worden aaneengeschakeld in de volgorde waarin ze zijn geüpload.
- Alle clips worden opnieuw geëncodeerd om overeen te komen met de resolutie, framerate (30 fps) en codec (H.264) van de eerste clip. Niet-overeenkomende invoer wordt automatisch genormaliseerd.
- Accepteert 2-10 videobestanden per verzoek.
- Voortgangsupdates zijn beschikbaar via SSE op `GET /api/v1/jobs/{jobId}/progress` totdat de taak is voltooid.
