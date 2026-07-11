---
description: "Einen Clip aus einem Video durch Angabe von Start- und Endzeiten ausschneiden."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 13a9b877e396
---

# Trim Video {#trim-video}

Einen Clip aus einem Video durch Angabe von Start- und Endzeiten in Sekunden ausschneiden, mit einer Option für frame-genaue Schnitte.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Startzeit in Sekunden (muss >= 0 sein) |
| endS | number | Yes | - | Endzeit in Sekunden (muss nach startS liegen) |
| precise | boolean | No | `false` | Für frame-genaue Schnitte neu kodieren statt Keyframe-Suche |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
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

- Wenn `precise` `false` ist (der Standard), verwendet das Tool die Keyframe-Suche, die schnell ist, aber möglicherweise einige Frames vor der angeforderten Zeit beginnt.
- Wenn `precise` auf `true` gesetzt wird, wird das Segment für exakte Frame-Grenzen neu kodiert, was jedoch länger dauert.
- Der Wert `endS` muss größer als `startS` sein.
