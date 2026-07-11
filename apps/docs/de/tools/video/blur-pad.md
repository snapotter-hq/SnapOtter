---
description: "Balken mit einer unscharfen Kopie des Videos füllen."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: ab60a31f1681
---

# Blur Pad {#blur-pad}

Passen Sie ein Video in ein Zielseitenverhältnis ein, indem Sie den Auffüllbereich mit einer unscharfen, skalierten Kopie des Videos statt mit einfarbigen Balken füllen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Akzeptiert Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| target | string | Nein | `"16:9"` | Zielseitenverhältnis: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | Nein | `20` | Gaußsches Weichzeichnen-Sigma für den Hintergrund (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Höhere Weichzeichnen-Werte erzeugen einen weicheren, abstrakteren Hintergrund. Niedrigere Werte lassen mehr Details sichtbar.
- Wenn das Video bereits dem Zielseitenverhältnis entspricht, wird die Datei unverändert zurückgegeben.
- Für einfarbige Auffüllung verwenden Sie stattdessen das Tool Aspect Pad.
