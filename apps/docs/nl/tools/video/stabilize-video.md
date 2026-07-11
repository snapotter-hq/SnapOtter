---
description: "Camerabeweging verminderen met tweevoudige stabilisatie."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 590cdb319b3c
---

# Stabilize Video {#stabilize-video}

Verminder camerabeweging in handheld-opnames met de tweevoudige vidstab-stabilisatie van FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`. Dit is een async endpoint: het retourneert direct `202 Accepted` en de voortgang wordt via SSE gestreamd op `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| smoothing | integer | Nee | `15` | Grootte van het smoothing-venster in frames (5-60). Hogere waarden leveren vloeiendere beweging op |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Stabilisatie is een tweevoudig proces: de eerste pass analyseert de camerabeweging en de tweede pass past de correctie toe. Dit duurt ongeveer twee keer zo lang als tools met één pass.
- Hogere smoothing-waarden verwijderen meer trillingen, maar kunnen een lichte zoombijsnijding aan de randen veroorzaken.
- Voortgangsupdates zijn beschikbaar via SSE op `GET /api/v1/jobs/{jobId}/progress` totdat de taak is voltooid.
