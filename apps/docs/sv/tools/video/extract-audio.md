---
description: "Dra ut ljudspåret ur en video."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: cb41c39b0224
---

# Extrahera ljud {#extract-audio}

Extrahera ljudspåret från en videofil och spara det som MP3, WAV, M4A eller OGG.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `"mp3"` | Utdataljudformat: `mp3`, `wav`, `m4a`, `ogg` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Anteckningar {#notes}

- Om videon inte har något ljudspår returnerar begäran ett 400-fel.
- MP3 är förstörande men brett kompatibelt. WAV är förlustfritt men stort. M4A (AAC) erbjuder en bra balans mellan kvalitet och storlek. OGG finns tillgängligt för arbetsflöden med öppna codecs.
- När källjudet redan är AAC och utdataformatet är M4A kopieras ljudströmmen utan omkodning.
