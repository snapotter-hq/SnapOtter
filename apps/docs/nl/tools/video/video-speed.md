---
description: "Een video versnellen of vertragen."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 22019df131c1
---

# Video Speed {#video-speed}

Versnel of vertraag een video met een optie om de toonhoogte van de audio te behouden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| factor | number | Nee | `2` | Snelheidsvermenigvuldiger (0.25-4). Waarden boven 1 versnellen, onder 1 vertragen |
| keepPitch | boolean | Nee | `true` | Toonhoogte van de audio behouden bij het wijzigen van de snelheid |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Een factor van `2` verdubbelt de afspeelsnelheid (halveert de duur). Een factor van `0.5` halveert de afspeelsnelheid (verdubbelt de duur).
- Wanneer `keepPitch` `true` is, wordt de audio in tijd gerekt zodat stemmen natuurlijk klinken. Bij `false` verschuift de toonhoogte proportioneel met de snelheid.
- Het geldige bereik is 0.25x tot 4x.
