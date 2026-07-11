---
description: "Het audiovolume van video normaliseren naar de broadcast-standaard."
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: 3d5f398c155a
---

# Normalize Audio {#normalize-audio}

Normaliseer het audiovolume van video naar de EBU R128 broadcast-luidheidsstandaard.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Accepteert multipart form data met een videobestand. Deze tool heeft geen instelbare opties.

## Parameters {#parameters}

Deze tool heeft geen parameters. Het past EBU R128-luidheidsnormalisatie toe op het audiospoor.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Gebruikt het `loudnorm`-filter van FFmpeg gericht op -16 LUFS geïntegreerde luidheid met -1.5 dBTP true peak en 11 LU loudness range (EBU R128 broadcast-standaard).
- De samplerate van de bronaudio blijft in de uitvoer behouden.
- Als de video geen audiospoor heeft, geeft het verzoek een 400-fout terug.
