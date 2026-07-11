---
description: "Teilt Audio nach Zeitintervallen, gleichen Teilen oder Stille-Erkennung."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 4f92916f9eab
---

# Split Audio {#split-audio}

Teilt eine Audiodatei in Segmente auf, entweder nach festen Zeitintervallen, gleichen Teilen oder automatischer Stille-Erkennung. Gibt ein ZIP-Archiv der Segmente zurück.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| mode | string | Nein | `"time"` | Aufteilungsstrategie: `time`, `parts`, `silence` |
| segmentS | number | Nein | `60` | Segmentlänge in Sekunden, 1 bis 3600 (verwendet, wenn mode `time` ist) |
| parts | integer | Nein | `2` | Anzahl gleicher Teile, 2 bis 20 (verwendet, wenn mode `parts` ist) |
| thresholdDb | number | Nein | `-40` | Stille-Schwellenwert in dB, -80 bis -20 (verwendet, wenn mode `silence` ist) |
| minSilenceS | number | Nein | `0.3` | Minimale Stille-Lücke in Sekunden, 0,1 bis 10 (verwendet, wenn mode `silence` ist) |

## Example Request {#example-request}

In 30-Sekunden-Segmente aufteilen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Nach Stille-Erkennung aufteilen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- Die `downloadUrl` verweist auf ein ZIP-Archiv, das alle Segmente enthält.
- Nur die für den gewählten `mode` relevanten Parameter werden verwendet; die übrigen werden ignoriert.
- Segment-Dateinamen sind fortlaufend nummeriert (z. B. `part-000.mp3`, `part-001.mp3`).
- Das Ausgabeformat entspricht dem Eingabeformat.
