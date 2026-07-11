---
description: "Ein Video beschleunigen oder verlangsamen."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 832795c6b5d1
---

# Video Speed {#video-speed}

Ein Video mit einer Option zur Beibehaltung der Audio-Tonhöhe beschleunigen oder verlangsamen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Geschwindigkeitsmultiplikator (0.25-4). Werte über 1 beschleunigen, unter 1 verlangsamen |
| keepPitch | boolean | No | `true` | Audio-Tonhöhe bei Geschwindigkeitsänderung beibehalten |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Ein Faktor von `2` verdoppelt die Wiedergabegeschwindigkeit (halbiert die Dauer). Ein Faktor von `0.5` halbiert die Wiedergabegeschwindigkeit (verdoppelt die Dauer).
- Wenn `keepPitch` `true` ist, wird das Audio zeitgestreckt, sodass Stimmen natürlich klingen. Bei `false` verschiebt sich die Tonhöhe proportional zur Geschwindigkeit.
- Der gültige Bereich ist 0.25x bis 4x.
