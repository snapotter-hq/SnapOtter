---
description: "Fyll fälten med en suddig kopia av videon."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 5e6753613e73
---

# Blur Pad {#blur-pad}

Få en video att passa in i ett målbildförhållande genom att fylla utfyllnadsområdet med en suddig, skalad kopia av videon istället för enfärgade fält.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| target | string | Nej | `"16:9"` | Målbildförhållande: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | Nej | `20` | Gaussisk oskärpa-sigma för bakgrunden (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Högre oskärpevärden ger en mjukare, mer abstrakt bakgrund. Lägre värden behåller mer synliga detaljer.
- Om videon redan matchar målbildförhållandet returneras filen oförändrad.
- För enfärgad utfyllnad, använd verktyget Aspect Pad istället.
