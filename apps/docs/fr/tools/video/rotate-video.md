---
description: "Fait pivoter ou retourne une vidéo."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: eaa3996d8a2d
---

# Rotate Video {#rotate-video}

Fait pivoter une vidéo de 90, 180 ou 270 degrés, ou la retourne horizontalement ou verticalement.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Transformation à appliquer : `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Rotation de 90 degrés dans le sens horaire
- **ccw90** - Rotation de 90 degrés dans le sens antihoraire
- **180** - Rotation de 180 degrés
- **hflip** - Retournement horizontal (miroir)
- **vflip** - Retournement vertical

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Les rotations de 90 ou 270 degrés inversent la largeur et la hauteur de la vidéo.
- Les opérations de retournement (hflip, vflip) ne modifient pas les dimensions de la vidéo.
