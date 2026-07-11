---
description: "Dela upp ljud efter tidsintervall, lika delar eller tystnadsdetektering."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 1c9add2dc75c
---

# Split Audio {#split-audio}

Dela upp en ljudfil i segment efter fasta tidsintervall, lika delar eller automatisk tystnadsdetektering. Returnerar ett ZIP-arkiv med segmenten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Tar emot multipart-formulärdata med en ljudfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | Uppdelningsstrategi: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | Segmentlängd i sekunder, 1 till 3600 (används när mode är `time`) |
| parts | integer | No | `2` | Antal lika delar, 2 till 20 (används när mode är `parts`) |
| thresholdDb | number | No | `-40` | Tystnadströskel i dB, -80 till -20 (används när mode är `silence`) |
| minSilenceS | number | No | `0.3` | Minsta tystnadsmellanrum i sekunder, 0,1 till 10 (används när mode är `silence`) |

## Example Request {#example-request}

Dela upp i 30-sekunderssegment:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Dela upp efter tystnadsdetektering:

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

- `downloadUrl` pekar på ett ZIP-arkiv som innehåller alla segment.
- Endast de parametrar som är relevanta för det valda `mode` används; övriga ignoreras.
- Segmentens filnamn numreras i sekvens (t.ex. `part-000.mp3`, `part-001.mp3`).
- Utdataformatet matchar indataformatet.
