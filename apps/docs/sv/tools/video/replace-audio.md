---
description: "Byt ut ljudspåret i en video mot en annan fil."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: b866c4eaac24
---

# Ersätt ljud {#replace-audio}

Byt ut ljudspåret i en video mot en ljudfil. Ladda upp både en video och en ljudfil.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Tar emot multipart-formulärdata med exakt två filer: en videofil följd av en ljudfil.

## Parametrar {#parameters}

Detta verktyg har inga inställningsparametrar. Ladda upp en videofil och en ljudfil som två `file`-delar.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Anteckningar {#notes}

- Exakt två filer måste laddas upp: den första måste vara en video, den andra måste vara en ljudfil.
- Om ljudfilen är längre än videon trimmas den för att matcha videons längd. Om den är kortare spelas den återstående videon upp i tystnad.
- Videoströmmen kopieras utan omkodning, så det finns ingen förlust av videokvalitet.
