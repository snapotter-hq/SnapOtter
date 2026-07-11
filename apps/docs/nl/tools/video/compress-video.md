---
description: "Videobestandsgrootte verkleinen met kwaliteitscontrole."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: bd96bd211a97
---

# Compress Video {#compress-video}

Verklein de videobestandsgrootte met een instelbare compressiesterkte en optioneel het verlagen van de resolutie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`. Dit is een async endpoint: het retourneert direct `202 Accepted` en de voortgang wordt via SSE gestreamd op `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| quality | string | Nee | `"balanced"` | Compressiesterkte: `light`, `balanced`, `strong` |
| resolution | string | Nee | `"original"` | Uitvoerresolutie: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- De preset `light` behoudt een kwaliteit die bijna gelijk is aan het origineel. De preset `strong` verkleint de bestandsgrootte agressief ten koste van de visuele getrouwheid.
- Het verlagen van de resolutie (bijvoorbeeld van 4K naar 720p) versterkt in combinatie met compressie de vermindering van de bestandsgrootte aanzienlijk.
- Voortgangsupdates zijn beschikbaar via SSE op `GET /api/v1/jobs/{jobId}/progress` totdat de taak is voltooid.
