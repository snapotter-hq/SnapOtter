---
description: "Vul balken met een vervaagde kopie van de video."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: c8a237fa270a
---

# Blur Pad {#blur-pad}

Pas een video in een doelbeeldverhouding door het opvulgebied te vullen met een vervaagde, geschaalde kopie van de video in plaats van balken in een effen kleur.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Accepteert multipart-formuliergegevens met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| target | string | Nee | `"16:9"` | Doelbeeldverhouding: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | Nee | `20` | Gaussische vervaging-sigma voor de achtergrond (2-50) |

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

- Hogere vervagingswaarden produceren een zachtere, abstractere achtergrond. Lagere waarden houden meer detail zichtbaar.
- Als de video al overeenkomt met de doelbeeldverhouding, wordt het bestand ongewijzigd teruggegeven.
- Gebruik voor opvulling in een effen kleur in plaats daarvan het hulpmiddel Aspect Pad.
