---
description: "Hämta undertextspåret ur en video som en SRT-, WebVTT- eller ASS-fil."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 3884b3ced102
i18n_hash_version: 2
---

# Extrahera undertexter {#extract-subtitles}

Extrahera det inbäddade undertextspåret från en videocontainer och ladda ner det som en SRT-, WebVTT- eller ASS-fil.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Tar emot multipart-formulärdata med en videofil och en valfri `settings`-JSON-sträng.

## Parametrar {#parameters}

| Namn | Typ | Standard | Beskrivning |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Utdataformat: `srt`, `vtt` (WebVTT) eller `ass` |

Det första undertextspåret som hittas i videocontainern extraheras.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Anteckningar {#notes}

- Videon måste innehålla ett inbäddat undertextspår. Om inget undertextspår hittas returnerar begäran ett 400-fel.
- Om videon har flera undertextspår extraheras det första.
- Textspår (SubRip, ASS, mov_text, WebVTT) kan konverteras till vilket som helst av de tre utdataformaten. När ett ASS-spår konverteras till SRT eller WebVTT försvinner dess positionering och effekter.
- Bildbaserade spår (Blu-ray PGS, DVD VobSub) kan inte göras om till text utan OCR och returnerar ett 422-fel.
