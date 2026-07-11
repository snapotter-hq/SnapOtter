---
description: "Zwischen Mono und Stereo konvertieren oder linken und rechten Kanal tauschen."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: e3a194397009
---

# Audiokanäle {#audio-channels}

Konvertiere Audio zwischen Mono- und Stereo-Layouts oder tausche den linken und rechten Kanal einer Stereodatei.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| mode | string | Ja | - | Kanaloperation: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Hinweise {#notes}

- `stereo-to-mono` mischt beide Kanäle zu einer einzigen Mono-Spur.
- `mono-to-stereo` dupliziert den Mono-Kanal auf links und rechts.
- `swap` tauscht den linken und rechten Kanal einer Stereodatei.
- Die Ausgabe behält üblicherweise den Eingabecontainer bei. AAC-Eingabe wird als M4A geschrieben, und nicht unterstützte Nur-Dekodier-Eingaben fallen auf MP3 zurück.
