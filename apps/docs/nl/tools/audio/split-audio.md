---
description: "Splits audio op tijdsintervallen, gelijke delen of stiltedetectie."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: e2fe745a5287
---

# Split Audio {#split-audio}

Splits een audiobestand in segmenten op vaste tijdsintervallen, gelijke delen of automatische stiltedetectie. Retourneert een ZIP-archief met de segmenten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Accepteert multipart-formulierdata met een audiobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Nee | `"time"` | Splitsstrategie: `time`, `parts`, `silence` |
| segmentS | number | Nee | `60` | Segmentlengte in seconden, 1 tot 3600 (gebruikt wanneer mode `time` is) |
| parts | integer | Nee | `2` | Aantal gelijke delen, 2 tot 20 (gebruikt wanneer mode `parts` is) |
| thresholdDb | number | Nee | `-40` | Stiltedrempel in dB, -80 tot -20 (gebruikt wanneer mode `silence` is) |
| minSilenceS | number | Nee | `0.3` | Minimale stiltepauze in seconden, 0.1 tot 10 (gebruikt wanneer mode `silence` is) |

## Example Request {#example-request}

Splitsen in segmenten van 30 seconden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Splitsen op stiltedetectie:

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

- De `downloadUrl` verwijst naar een ZIP-archief met alle segmenten.
- Alleen de parameters die relevant zijn voor de gekozen `mode` worden gebruikt; de overige worden genegeerd.
- Segmentbestandsnamen worden opeenvolgend genummerd (bijv. `part-000.mp3`, `part-001.mp3`).
- Het uitvoerformaat komt overeen met het invoerformaat.
