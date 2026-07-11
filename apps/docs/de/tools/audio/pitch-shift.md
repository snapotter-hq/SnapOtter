---
description: "Tonhöhe um Halbtöne anheben oder senken, ohne die Geschwindigkeit zu ändern."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 00e10fd76abb
---

# Tonhöhenverschiebung {#pitch-shift}

Hebe oder senke die Tonhöhe einer Audiodatei um eine Anzahl von Halbtönen, ohne die Wiedergabegeschwindigkeit zu ändern.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| semitones | integer | Nein | `3` | Zu verschiebende Halbtöne (-12 bis 12). Muss ungleich null sein. |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- Positive Werte heben die Tonhöhe an; negative Werte senken sie.
- Eine Verschiebung um 12 Halbtöne entspricht einer Oktave nach oben; -12 entspricht einer Oktave nach unten.
- Die Wiedergabedauer bleibt unabhängig vom Verschiebungsbetrag gleich.
- Die Ausgabe behält üblicherweise den Eingabecontainer bei. AAC-Eingabe wird als M4A geschrieben, und nicht unterstützte Nur-Dekodier-Eingaben fallen auf MP3 zurück.
