---
description: "Convertit un clip vidéo en image WebP animée."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: b8e2279cc53a
---

# Video to WebP {#video-to-webp}

Convertit un clip vidéo en image WebP animée avec une fréquence d'images, une largeur et une qualité configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Fréquence d'images de sortie (1-30) |
| width | integer | No | `480` | Largeur de sortie en pixels (16-1920). La hauteur est mise à l'échelle proportionnellement |
| quality | integer | No | `75` | Qualité de compression WebP (1-100) |
| loop | boolean | No | `true` | Boucle l'animation |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Le WebP animé produit des fichiers plus petits que le GIF avec une meilleure prise en charge des couleurs (palette 24 bits contre 8 bits).
- Des valeurs plus faibles de `quality` produisent des fichiers plus petits au détriment de la fidélité visuelle.
- Réglez `loop` sur `false` pour les animations qui doivent être jouées une seule fois puis s'arrêter.
