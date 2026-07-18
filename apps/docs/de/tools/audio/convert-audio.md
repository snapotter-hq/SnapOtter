---
description: "Audio zwischen den Formaten MP3, WAV, OGG, FLAC und M4A konvertieren."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: bacd9e312553
---

# Audio konvertieren {#convert-audio}

Konvertiere Audiodateien zwischen gängigen Formaten wie MP3, WAV, OGG, FLAC und M4A, mit konfigurierbarer Ausgabe-Bitrate und Abtastrate.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Nein | `"mp3"` | Ausgabeformat: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Nein | `192` | Ausgabe-Bitrate in kbps (32 bis 320) |
| sampleRate | integer | Nein | Quellrate | Ausgabe-Abtastrate in Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` oder `96000`. Weglassen, um die Quellrate beizubehalten |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Hinweise {#notes}

- Zu den unterstützten Eingabeformaten gehören MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF und OPUS.
- Die Bitrate gilt nur für verlustbehaftete Formate (MP3, OGG, M4A). Verlustfreie Formate wie WAV und FLAC ignorieren diese Einstellung.
- Die MP3-Ausgabe unterstützt Abtastraten bis zu 48000 Hz. Die Option 96000 Hz gilt nur für WAV, OGG, FLAC und M4A.
- Die MP3-Bitrate ist durch die Abtastrate begrenzt: höchstens 64 kbps bei 8000 Hz und 160 kbps bei 16000 oder 22050 Hz. Anfragen über der Obergrenze werden abgelehnt, statt stillschweigend gesenkt zu werden.
- Der Ausgabedateiname behält den ursprünglichen Namen mit der neuen Erweiterung bei.
