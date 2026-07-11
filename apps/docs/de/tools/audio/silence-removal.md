---
description: "Entfernt stille Abschnitte aus einer Audiodatei."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 82d84597cc95
---

# Silence Removal {#silence-removal}

Erkennt und entfernt stille Abschnitte aus einer Audiodatei anhand eines konfigurierbaren Schwellenwerts und einer Mindestdauer.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | Nein | `-50` | Stille-Schwellenwert in dB (-80 bis -20). Audio unterhalb dieses Pegels gilt als still. |
| minSilenceS | number | Nein | `0.5` | Mindestdauer der Stille in Sekunden, die entfernt werden soll (0,1 bis 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Ein höherer (weniger negativer) Schwellenwert ist aggressiver und entfernt neben echter Stille auch leisere Passagen.
- Erhöhe `minSilenceS`, um nur längere Pausen zu entfernen und kurze natürliche Lücken zu erhalten.
- Nützlich zum Aufräumen von Podcast-Aufnahmen, Vorlesungen und Sprachmemos.
- Die Ausgabe behält in der Regel den Eingabecontainer bei. AAC-Eingaben werden als M4A geschrieben, und nicht unterstützte, nur decodierbare Eingaben fallen auf MP3 zurück.
