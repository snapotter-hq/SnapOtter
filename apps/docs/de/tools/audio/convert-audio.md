---
description: "Audio zwischen den Formaten MP3, WAV, OGG, FLAC und M4A konvertieren."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: bacd9e312553
---

# Audio konvertieren {#convert-audio}

Konvertiere Audiodateien zwischen gängigen Formaten wie MP3, WAV, OGG, FLAC und M4A, mit konfigurierbarer Ausgabe-Bitrate.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Nein | `"mp3"` | Ausgabeformat: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Nein | `192` | Ausgabe-Bitrate in kbps (32 bis 320) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Hinweise {#notes}

- Zu den unterstützten Eingabeformaten gehören MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF und OPUS.
- Die Bitrate gilt nur für verlustbehaftete Formate (MP3, OGG, M4A). Verlustfreie Formate wie WAV und FLAC ignorieren diese Einstellung.
- Der Ausgabedateiname behält den ursprünglichen Namen mit der neuen Erweiterung bei.
