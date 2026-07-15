---
description: "Normalisera videons ljudvolym till broadcast-standard."
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: e9c221d506ca
---

# Normalisera videons ljud {#normalize-audio}

Normalisera videons ljudvolym till broadcast-standarden EBU R128 för ljudstyrka.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Tar emot multipart-formulärdata med en videofil. Detta verktyg har inga konfigurerbara inställningar.

## Parametrar {#parameters}

Detta verktyg har inga parametrar. Det tillämpar ljudstyrkenormalisering enligt EBU R128 på ljudspåret.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Anteckningar {#notes}

- Använder FFmpegs filter `loudnorm` som riktar in sig på -16 LUFS integrerad ljudstyrka med -1.5 dBTP true peak och 11 LU ljudstyrkeområde (broadcast-standarden EBU R128).
- Källjudets samplingsfrekvens bevaras i utdata.
- Om videon inte har något ljudspår returnerar begäran ett 400-fel.
