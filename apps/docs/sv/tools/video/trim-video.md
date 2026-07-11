---
description: "Klipp ut ett klipp ur en video genom att ange start- och sluttider."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 973e0e6bfe50
---

# Trimma video {#trim-video}

Klipp ut ett klipp ur en video genom att ange start- och sluttider i sekunder, med ett alternativ för bildruteexakta klipp.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| startS | number | Nej | `0` | Starttid i sekunder (måste vara >= 0) |
| endS | number | Ja | - | Sluttid i sekunder (måste vara efter startS) |
| precise | boolean | Nej | `false` | Omkoda för bildruteexakta klipp i stället för nyckelbildsökning |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Anteckningar {#notes}

- När `precise` är `false` (standardvärdet) använder verktyget nyckelbildsökning, vilket är snabbt men kan börja några bildrutor före den begärda tiden.
- Att sätta `precise` till `true` omkodar segmentet för exakta bildrutegränser, men tar längre tid.
- Värdet `endS` måste vara större än `startS`.
