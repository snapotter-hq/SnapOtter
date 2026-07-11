---
description: "Ein Video auf eine neue Auflösung oder voreingestellte Größe skalieren."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: 93d1f5cb2e90
---

# Resize Video {#resize-video}

Ein Video mit benutzerdefinierten Pixelabmessungen oder einer Standardvoreinstellung auf eine neue Auflösung skalieren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Zielbreite in Pixeln (16-7680) |
| height | integer | No | - | Zielhöhe in Pixeln (16-4320) |
| preset | string | No | `"custom"` | Auflösungsvoreinstellung: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Wenn `preset` `"custom"` ist, muss mindestens einer von `width` oder `height` angegeben werden. Die andere Dimension wird proportional skaliert.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Auf benutzerdefinierte Abmessungen skalieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Voreinstellungswerte werden auf Standardhöhen abgebildet (z. B. `720p` = 1280x720, `1080p` = 1920x1080). Die Breite skaliert proportional zum Seitenverhältnis der Quelle.
- Abmessungen werden auf gerade Zahlen gerundet, wie es die meisten Videocodecs erfordern.
- Die maximal unterstützte Auflösung beträgt 7680x4320 (8K UHD).
