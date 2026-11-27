---
description: "Einen Clip aus einem Video durch Angabe von Start- und Endzeiten ausschneiden."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 2a7ffccbecbc
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Einen Clip aus einem Video ausschneiden. Entweder wird der Abschnitt zwischen einer Start- und einer Endzeit behalten, oder es wird eine feste Dauer am Anfang und am Ende abgeschnitten. Es gibt eine Option für frame-genaue Schnitte.

In der App akzeptieren die Zeitfelder reine Sekunden (`90`), `MM:SS` (`1:30`) oder `HH:MM:SS` (`1:02:03.5`). Die API erwartet Sekunden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` behält `startS` bis `endS`. `ends` entfernt `cutStartS` am Anfang und `cutEndS` am Ende |
| startS | number | No | `0` | Range mode: Startzeit in Sekunden (muss >= 0 sein) |
| endS | number | Range mode | - | Range mode: Endzeit in Sekunden (muss nach startS liegen) |
| cutStartS | number | No | `0` | Ends mode: Sekunden, die am Anfang entfernt werden |
| cutEndS | number | No | `0` | Ends mode: Sekunden, die am Ende entfernt werden |
| precise | boolean | No | `false` | Den gesamten Bereich neu kodieren, damit Start- und Endframe exakt sind, statt ab dem nächsten Keyframe zu kopieren |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Die ersten 5 Sekunden und die letzten 10 Sekunden abschneiden, unabhängig von der Länge des Videos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Wenn `precise` auf `false` steht (der Standard), beginnt der Clip exakt auf dem angeforderten Frame. Nur die Frames zwischen diesem Start und dem nächsten Keyframe werden neu kodiert, der Rest wird kopiert, daher bleibt der Vorgang schnell. Das Ende kann ein Frame oder so zu lang ausfallen, weil ein kopierter Stream die Frames behält, von denen frühere Frames abhängen. Quellen, die sich so nicht sicher zusammenfügen lassen (H.264 mit 10 Bit oder Zeilensprung, andere Codecs, die einen neu kodierten Anfang brauchen, oder AVI-, FLV-, MPEG- und TS-Dateien), werden stattdessen vollständig neu kodiert.
- Wird `precise` auf `true` gesetzt, wird immer der gesamte Bereich neu kodiert. Beide Enden sind dann exakt, aber es dauert länger.
- Im range mode muss `endS` größer als `startS` sein. Liegt `endS` hinter dem Ende des Videos, läuft der Clip bis zum Ende.
- Im ends mode muss mindestens einer der Werte `cutStartS` und `cutEndS` größer als null sein, und zusammen müssen sie einen Teil des Videos übrig lassen. Da der Schnitt von der Länge der jeweiligen Datei aus gemessen wird, funktioniert eine Einstellung für einen Stapel von Videos mit unterschiedlicher Dauer.
