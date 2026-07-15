---
description: "Erhöht oder verringert die Audiolautstärke um eine feste Verstärkung in Dezibel."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 6857a2f0c216
---

# Lautstärke anpassen {#volume-adjust}

Erhöht oder verringert die Lautstärke einer Audiodatei durch Anwendung einer festen Verstärkung in Dezibel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| gainDb | number | Nein | `3` | Lautstärkeanpassung in Dezibel (-30 bis 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Positive Werte erhöhen die Lautstärke; negative Werte verringern sie.
- Große positive Verstärkungen können zu Clipping führen. Verwende normalize-audio für ein lautstärkesicheres Nivellieren.
- Die Ausgabe behält in der Regel den Eingabecontainer bei. AAC-Eingaben werden als M4A geschrieben, und nicht unterstützte, nur decodierbare Eingaben fallen auf MP3 zurück.
