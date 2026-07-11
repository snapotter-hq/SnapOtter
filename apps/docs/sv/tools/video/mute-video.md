---
description: "Ta bort ljudspåret från en video."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: c673ebcec580
---

# Tysta video {#mute-video}

Ta bort ljudspåret från en video och lämna endast den visuella strömmen.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Tar emot multipart-formulärdata med en videofil. Detta verktyg har inga konfigurerbara inställningar.

## Parametrar {#parameters}

Detta verktyg har inga parametrar. Det tar bort ljudspåret från den uppladdade videon.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Anteckningar {#notes}

- Videoströmmen kopieras utan omkodning, så det finns ingen kvalitetsförlust.
- Om indatavideon inte har något ljudspår returneras filen oförändrad.
