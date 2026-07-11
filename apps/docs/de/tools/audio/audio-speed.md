---
description: "Audiowiedergabe mit einem Multiplikator beschleunigen oder verlangsamen."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 1099720bed90
---

# Audiogeschwindigkeit {#audio-speed}

Beschleunige oder verlangsame die Audiowiedergabe durch Anwenden eines Geschwindigkeitsmultiplikators.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| factor | number | Nein | `1.5` | Geschwindigkeitsmultiplikator (0,25 bis 4). Werte unter 1 verlangsamen; über 1 beschleunigen. |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Hinweise {#notes}

- Ein Faktor von `0.25` spielt mit Vierteltempo ab (4x länger). Ein Faktor von `4` spielt mit vierfachem Tempo ab (4x kürzer).
- Die Tonhöhe bleibt erhalten, während sich die Geschwindigkeit ändert (Time-Stretch). Verwende Pitch-Shift, um die Tonhöhe unabhängig anzupassen.
- Die Ausgabe behält üblicherweise den Eingabecontainer bei. AAC-Eingabe wird als M4A geschrieben, und nicht unterstützte Nur-Dekodier-Eingaben fallen auf MP3 zurück.
