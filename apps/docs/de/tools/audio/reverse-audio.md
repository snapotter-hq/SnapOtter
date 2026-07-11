---
description: "Eine Audiodatei umkehren, sodass sie rückwärts abgespielt wird."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 5a5121e03333
---

# Audio umkehren {#reverse-audio}

Kehre eine Audiodatei um, sodass sie rückwärts abgespielt wird.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Die gesamte Audiodatei wird umgekehrt.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
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

- Die gesamte Audiospur wird von Ende zu Anfang umgekehrt.
- Die Ausgabe behält üblicherweise den Eingabecontainer bei. AAC-Eingabe wird als M4A geschrieben, und nicht unterstützte Nur-Dekodier-Eingaben fallen auf MP3 zurück.
