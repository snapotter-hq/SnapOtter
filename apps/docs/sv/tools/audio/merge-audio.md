---
description: "Kombinera flera ljudfiler till ett sekventiellt spår."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 35cceaa4131d
---

# Merge Audio {#merge-audio}

Kombinera två eller flera ljudfiler till ett enda sekventiellt spår, sammanfogade i den ordning de laddas upp.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Accepterar multipart-formulärdata med flera ljudfiler och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `"mp3"` | Utdataformat: `mp3`, `wav`, `flac`, `m4a` |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Anteckningar {#notes}

- Accepterar 2 till 10 ljudfiler per förfrågan.
- Filerna sammanfogas i uppladdningsordning.
- Alla inmatningsfiler omkodas till det valda utdataformatet och samplingsfrekvensen för sömlös sammanfogning.
- Blandade inmatningsformat stöds (t.ex. en WAV och en MP3).
