---
description: "Het ondertitelspoor uit een video halen als een SRT-bestand."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: d34409f39e07
---

# Extract Subtitles {#extract-subtitles}

Haal het ingebedde ondertitelspoor uit een videocontainer en download het als een SRT-bestand.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Accepteert multipart form data met een videobestand. Deze tool heeft geen instelbare opties.

## Parameters {#parameters}

Deze tool heeft geen parameters. Het haalt het eerste ondertitelspoor eruit dat in de videocontainer wordt gevonden.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- De video moet een ingebed ondertitelspoor bevatten. Als er geen ondertitelspoor wordt gevonden, geeft het verzoek een 400-fout terug.
- Als de video meerdere ondertitelsporen heeft, wordt het eerste eruit gehaald.
- Het uitvoerformaat is SRT, ongeacht het oorspronkelijke ondertitelformaat in de container.
