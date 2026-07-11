---
description: "Video's converteren tussen MP4, MOV, WebM, AVI en MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 1bdfad1a66e0
---

# Convert Video {#convert-video}

Converteer video's tussen de formaten MP4, MOV, WebM, AVI en MKV met instelbare kwaliteitspresets.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`. Dit is een async endpoint: het retourneert direct `202 Accepted` en de voortgang wordt via SSE gestreamd op `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `"mp4"` | Uitvoerformaat: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | Nee | `"balanced"` | Kwaliteitspreset: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- De kwaliteitspreset `high` levert de beste visuele getrouwheid op, maar grotere bestanden. De preset `small` comprimeert agressief voor een minimale bestandsgrootte.
- WebM-uitvoer gebruikt VP9-encoding. MP4 en MOV gebruiken H.264. AVI en MKV zijn beschikbaar voor legacy- of archiveringsworkflows.
- Voortgangsupdates zijn beschikbaar via SSE op `GET /api/v1/jobs/{jobId}/progress` totdat de taak is voltooid.
