---
description: "Voeg balken in een effen kleur toe om aan een doelbeeldverhouding te voldoen."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 6e0a6b8f1c47
---

# Aspect Pad {#aspect-pad}

Voeg letterbox- of pillarbox-balken in een effen kleur toe om een video in een doelbeeldverhouding te passen zonder bij te snijden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Accepteert multipart-formuliergegevens met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| target | string | Nee | `"9:16"` | Doelbeeldverhouding: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | Nee | `"#000000"` | Hex-kleur voor de opvulbalken (bijv. `"#000000"` voor zwart) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Als de video al overeenkomt met de doelbeeldverhouding, wordt het bestand ongewijzigd teruggegeven.
- Gebruik `9:16` voor verticale/portret-socialmedia-indelingen (TikTok, Reels, Shorts).
- Gebruik voor vervaagde opvulling in plaats van een effen kleur het hulpmiddel Blur Pad.
