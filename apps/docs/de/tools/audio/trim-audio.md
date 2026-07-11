---
description: "Schneidet einen Abschnitt aus einer Audiodatei heraus, indem Start- und Endzeit angegeben werden."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 2f6908c8f9cf
---

# Trim Audio {#trim-audio}

Schneidet einen Abschnitt aus einer Audiodatei heraus, indem Start- und Endzeit in Sekunden angegeben werden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| startS | number | Nein | `0` | Startzeit in Sekunden (Minimum 0) |
| endS | number | Ja | - | Endzeit in Sekunden (muss nach dem Start liegen) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Zeiten werden in Sekunden angegeben und können Dezimalstellen enthalten (z. B. `10.5`).
- Der Wert `endS` muss größer sein als `startS`.
- Wenn `endS` die Audiodauer überschreitet, wird die Datei bis zum Ende zugeschnitten.
- Die Ausgabe behält in der Regel den Eingabecontainer bei. AAC-Eingaben werden als M4A geschrieben, und nicht unterstützte, nur decodierbare Eingaben fallen auf MP3 zurück.
