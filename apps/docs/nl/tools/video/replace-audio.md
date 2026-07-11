---
description: "Het audiospoor van een video vervangen door een ander bestand."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: 98aa1f0e4c2f
---

# Replace Audio {#replace-audio}

Vervang het audiospoor van een video door een audiobestand. Upload zowel een video als een audiobestand.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Accepteert multipart form data met precies twee bestanden: een videobestand gevolgd door een audiobestand.

## Parameters {#parameters}

Deze tool heeft geen instellingsparameters. Upload een videobestand en een audiobestand als twee `file`-delen.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Er moeten precies twee bestanden worden geüpload: het eerste moet een video zijn, het tweede moet een audiobestand zijn.
- Als het audiobestand langer is dan de video, wordt het ingekort tot de duur van de video. Is het korter, dan speelt de rest van de video in stilte af.
- Het beeldspoor wordt gekopieerd zonder opnieuw te encoderen, dus er is geen verlies van videokwaliteit.
