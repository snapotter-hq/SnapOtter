---
description: "Schneidet einen Abschnitt aus einer Audiodatei heraus, indem Start- und Endzeit angegeben werden."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 5542723741c0
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Schneidet einen Abschnitt aus einer Audiodatei heraus. Behalte entweder den Teil zwischen einer Start- und einer Endzeit oder schneide einen festen Betrag vom Anfang und vom Ende ab.

In der App akzeptieren Zeitfelder reine Sekunden (`90`), `MM:SS` (`1:30`) oder `HH:MM:SS` (`1:02:03.5`). Die API erwartet Sekunden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| mode | string | Nein | `range` | `range` behält `startS` bis `endS`. `ends` entfernt `cutStartS` vom Anfang und `cutEndS` vom Ende |
| startS | number | Nein | `0` | Bereichsmodus: Startzeit in Sekunden (Minimum 0) |
| endS | number | Bereichsmodus | - | Bereichsmodus: Endzeit in Sekunden (muss nach dem Start liegen) |
| cutStartS | number | Nein | `0` | Ends-Modus: Sekunden, die vom Anfang entfernt werden |
| cutEndS | number | Nein | `0` | Ends-Modus: Sekunden, die vom Ende entfernt werden |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Die ersten 2 Sekunden und die letzten 3 Sekunden abschneiden, unabhängig von der Dateilänge:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
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
- Im Bereichsmodus muss `endS` größer sein als `startS`. Wenn `endS` die Audiodauer überschreitet, wird die Datei bis zum Ende zugeschnitten.
- Im Ends-Modus muss mindestens einer der Werte `cutStartS` und `cutEndS` größer als null sein, und zusammen müssen sie mindestens 0,1 Sekunden Audio übrig lassen. Da der Schnitt von der Länge der jeweiligen Datei aus gemessen wird, funktioniert eine Einstellung für einen Stapel von Dateien mit unterschiedlicher Dauer.
- Die Ausgabe behält in der Regel den Eingabecontainer bei. AAC-Eingaben werden als M4A geschrieben, und nicht unterstützte, nur decodierbare Eingaben fallen auf MP3 zurück.
