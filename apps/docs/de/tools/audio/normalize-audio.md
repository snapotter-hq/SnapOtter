---
description: "Lautheit auf Broadcast-Standardpegel angleichen (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 9ebc3620a286
---

# Audio normalisieren {#normalize-audio}

Gleiche die Audiolautheit mit EBU-R128-Normalisierung (-16 LUFS) auf Broadcast-Standardpegel an.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Es wendet automatisch die EBU-R128-Lautheitsnormalisierung an.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Hinweise {#notes}

- Verwendet den EBU-R128-Lautheitsstandard mit Zielwert -16 LUFS.
- Ideal für Podcasts, Hörbücher und Broadcast-Inhalte, bei denen gleichmäßige Lautheit wichtig ist.
- Die Abtastrate der Quelle bleibt in der Ausgabe erhalten.
- Die Ausgabe behält üblicherweise den Eingabecontainer bei. AAC-Eingabe wird als M4A geschrieben, und nicht unterstützte Nur-Dekodier-Eingaben fallen auf MP3 zurück.
