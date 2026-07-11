---
description: "Het audiospoor uit een video halen."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 775808761b2a
---

# Extract Audio {#extract-audio}

Haal het audiospoor uit een videobestand en sla het op als MP3, WAV, M4A of OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `"mp3"` | Uitvoeraudioformaat: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Als de video geen audiospoor heeft, geeft het verzoek een 400-fout terug.
- MP3 is lossy maar breed compatibel. WAV is lossless maar groot. M4A (AAC) biedt een goede balans tussen kwaliteit en grootte. OGG is beschikbaar voor workflows met open codecs.
- Wanneer de bronaudio al AAC is en het uitvoerformaat M4A is, wordt het audiospoor gekopieerd zonder opnieuw te encoderen.
