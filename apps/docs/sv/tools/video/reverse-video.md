---
description: "Spela upp ett videoklipp baklänges."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 367036902c1f
---

# Vänd video {#reverse-video}

Spela upp ett videoklipp baklänges. Ljudspåret vänds också.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Tar emot multipart-formulärdata med en videofil. Detta verktyg har inga konfigurerbara inställningar.

## Parametrar {#parameters}

Detta verktyg har inga parametrar. Det vänder hela videon.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Anteckningar {#notes}

- Begränsat till klipp på upp till 5 minuters längd. Längre videor avvisas med ett 400-fel.
- Både video- och ljudspår vänds. För att vända video utan ljud, tysta den först.
