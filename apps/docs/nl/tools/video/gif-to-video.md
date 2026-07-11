---
description: "Een geanimeerde GIF omzetten naar een MP4-, WebM- of MOV-video."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 43b82d873cef
---

# GIF to Video {#gif-to-video}

Zet een geanimeerde GIF om naar een compact MP4-, WebM- of MOV-videobestand.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Accepteert multipart form data met een GIF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `"mp4"` | Uitvoerformaat: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Het omzetten van GIF naar video verkleint de bestandsgrootte doorgaans met 80-90% terwijl dezelfde visuele kwaliteit behouden blijft.
- Alleen geanimeerde GIF-bestanden worden geaccepteerd. Voor statische afbeeldingen gebruik je de image Convert-tool.
- MP4 en MOV gebruiken H.264-encoding, WebM gebruikt VP9.
