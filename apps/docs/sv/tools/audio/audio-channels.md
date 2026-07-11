---
description: "Konvertera mellan mono och stereo eller byt plats på vänster och höger kanal."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 71433b2fbabd
---

# Audio Channels {#audio-channels}

Konvertera ljud mellan mono- och stereolayouter, eller byt plats på vänster och höger kanal i en stereofil.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| mode | string | Ja | - | Kanaloperation: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Anteckningar {#notes}

- `stereo-to-mono` mixar båda kanalerna till ett enda monospår.
- `mono-to-stereo` duplicerar monokanalen till både vänster och höger.
- `swap` byter plats på vänster och höger kanal i en stereofil.
- Utdata behåller vanligtvis inmatningens container. AAC-inmatning skrivs som M4A, och inmatningar som endast kan avkodas och inte stöds faller tillbaka till MP3.
