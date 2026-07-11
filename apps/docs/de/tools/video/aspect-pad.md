---
description: "Einfarbige Balken hinzufügen, um ein Zielseitenverhältnis zu erreichen."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 2c586be0fd20
---

# Seitenverhältnis auffüllen {#aspect-pad}

Fügen Sie einfarbige Letterbox- oder Pillarbox-Balken hinzu, um ein Video ohne Zuschneiden in ein Zielseitenverhältnis einzupassen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Akzeptiert Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| target | string | Nein | `"9:16"` | Zielseitenverhältnis: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | Nein | `"#000000"` | Hex-Farbe für die Auffüllbalken (z. B. `"#000000"` für Schwarz) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Wenn das Video bereits dem Zielseitenverhältnis entspricht, wird die Datei unverändert zurückgegeben.
- Verwenden Sie `9:16` für vertikale/Hochformat-Social-Media-Formate (TikTok, Reels, Shorts).
- Für unscharfe Auffüllung anstelle einer einfarbigen Fläche verwenden Sie das Tool Blur Pad.
