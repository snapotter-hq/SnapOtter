---
description: "Konvertera ljud mellan formaten MP3, WAV, OGG, FLAC och M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: a3c8a930904d
---

# Convert Audio {#convert-audio}

Konvertera ljudfiler mellan vanliga format inklusive MP3, WAV, OGG, FLAC och M4A, med konfigurerbar utdatabithastighet.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `"mp3"` | Utdataformat: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Nej | `192` | Utdatabithastighet i kbps (32 till 320) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Anteckningar {#notes}

- Inmatningsformat som stöds inkluderar MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF och OPUS.
- Bithastighet gäller endast förlustkomprimerade format (MP3, OGG, M4A). Förlustfria format som WAV och FLAC ignorerar den här inställningen.
- Utdatafilnamnet behåller det ursprungliga namnet med den nya filändelsen.
