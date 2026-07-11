---
description: "Dra ut undertextspåret ur en video som en SRT-fil."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: e59d5b391e74
---

# Extrahera undertexter {#extract-subtitles}

Extrahera det inbäddade undertextspåret från en videocontainer och ladda ner det som en SRT-fil.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Tar emot multipart-formulärdata med en videofil. Detta verktyg har inga konfigurerbara inställningar.

## Parametrar {#parameters}

Detta verktyg har inga parametrar. Det extraherar det första undertextspåret som hittas i videocontainern.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Anteckningar {#notes}

- Videon måste innehålla ett inbäddat undertextspår. Om inget undertextspår hittas returnerar begäran ett 400-fel.
- Om videon har flera undertextspår extraheras det första.
- Utdataformatet är SRT oavsett det ursprungliga undertextformatet i containern.
