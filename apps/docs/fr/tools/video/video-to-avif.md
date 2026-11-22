---
description: "Convertit un clip vidéo en image AVIF animée."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 3396ea1cea1a
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Convertit un clip vidéo en image AVIF animée avec fréquence d'images, largeur, qualité et plage du clip configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Fréquence d'images de sortie (1-30) |
| width | integer | No | `480` | Largeur de sortie en pixels (64-1280). La hauteur est mise à l'échelle proportionnellement |
| startS | number | No | `0` | Début du clip, en secondes |
| durationS | number | No | `5` | Durée du clip en secondes (jusqu'à 60) |
| quality | integer | No | `50` | Qualité AVIF (1-100) |
| loop | boolean | No | `true` | Boucle l'animation |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

L'encodage AV1 est plus lent que GIF ou WebP, donc cet outil répond généralement `202` avec une tâche à suivre via SSE sur `/api/v1/jobs/{jobId}/progress`. Un clip court peut se terminer dans la fenêtre synchrone et renvoyer directement le résultat :

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- L'AVIF animé est libre de redevances et généralement plus léger qu'un WebP ou GIF animé à qualité visuelle égale.
- Les navigateurs actuels lisent l'AVIF animé. Certaines visionneuses d'images de bureau n'affichent que la première image.
- La piste audio est supprimée.
