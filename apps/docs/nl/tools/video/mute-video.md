---
description: "Het audiospoor uit een video verwijderen."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: a6993cd53f60
---

# Mute Video {#mute-video}

Verwijder het audiospoor uit een video, zodat alleen het beeldspoor overblijft.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Accepteert multipart form data met een videobestand. Deze tool heeft geen instelbare opties.

## Parameters {#parameters}

Deze tool heeft geen parameters. Het verwijdert het audiospoor uit de geüploade video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Het beeldspoor wordt gekopieerd zonder opnieuw te encoderen, dus er is geen kwaliteitsverlies.
- Als de invoervideo geen audiospoor heeft, wordt het bestand ongewijzigd teruggegeven.
