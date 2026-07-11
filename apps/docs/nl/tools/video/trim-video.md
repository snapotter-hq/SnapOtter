---
description: "Een clip uit een video knippen door start- en eindtijden op te geven."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 1d00aaeaddde
---

# Trim Video {#trim-video}

Knip een clip uit een video door de start- en eindtijd in seconden op te geven, met een optie voor frame-nauwkeurige knippen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| startS | number | Nee | `0` | Starttijd in seconden (moet >= 0 zijn) |
| endS | number | Ja | - | Eindtijd in seconden (moet na startS liggen) |
| precise | boolean | Nee | `false` | Opnieuw encoderen voor frame-nauwkeurige knippen in plaats van keyframe-seek |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Wanneer `precise` `false` is (de standaard), gebruikt de tool keyframe-seeking, wat snel is maar een paar frames vóór het gevraagde tijdstip kan beginnen.
- `precise` instellen op `true` encodeert het segment opnieuw voor exacte framegrenzen, maar duurt langer.
- De waarde `endS` moet groter zijn dan `startS`.
