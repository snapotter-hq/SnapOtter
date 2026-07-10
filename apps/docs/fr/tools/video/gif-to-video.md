---
description: "Convertit un GIF animé en vidéo MP4, WebM ou MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: a15529b605cc
---

# GIF to Video {#gif-to-video}

Convertit un GIF animé en un fichier vidéo compact MP4, WebM ou MOV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Accepte des données de formulaire multipart avec un fichier GIF et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Format de sortie : `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Convertir un GIF en vidéo réduit généralement la taille du fichier de 80 à 90 % tout en conservant la même qualité visuelle.
- Seuls les fichiers GIF animés sont acceptés. Les images statiques doivent utiliser l'outil image Convert.
- MP4 et MOV utilisent l'encodage H.264, WebM utilise VP9.
