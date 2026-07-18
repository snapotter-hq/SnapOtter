---
description: "Konvertera ljud mellan formaten MP3, WAV, OGG, FLAC och M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: a3c8a930904d
---

# Convert Audio {#convert-audio}

Konvertera ljudfiler mellan vanliga format inklusive MP3, WAV, OGG, FLAC och M4A, med konfigurerbar utdatabithastighet och samplingsfrekvens.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `"mp3"` | Utdataformat: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Nej | `192` | Utdatabithastighet i kbps (32 till 320) |
| sampleRate | integer | Nej | källans frekvens | Utdatasamplingsfrekvens i Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` eller `96000`. Utelämna för att behålla källans frekvens |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Anteckningar {#notes}

- Inmatningsformat som stöds inkluderar MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF och OPUS.
- Bithastighet gäller endast förlustkomprimerade format (MP3, OGG, M4A). Förlustfria format som WAV och FLAC ignorerar den här inställningen.
- MP3-utdata stöder samplingsfrekvenser upp till 48000 Hz. Alternativet 96000 Hz gäller endast WAV, OGG, FLAC och M4A.
- MP3-bithastigheten begränsas av samplingsfrekvensen: högst 64 kbps vid 8000 Hz och 160 kbps vid 16000 eller 22050 Hz. Förfrågningar över gränsen avvisas i stället för att tyst sänkas.
- Utdatafilnamnet behåller det ursprungliga namnet med den nya filändelsen.
