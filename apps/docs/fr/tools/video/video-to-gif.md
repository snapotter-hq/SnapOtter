---
description: "Transforme un clip vidéo en GIF animé."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 6853015c7c15
---

# Video to GIF {#video-to-gif}

Transforme un clip vidéo en GIF animé avec une fréquence d'images, une largeur, un temps de début et une durée configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`. Il s'agit d'un point de terminaison asynchrone : il renvoie immédiatement `202 Accepted` et la progression est diffusée via SSE sur `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Fréquence d'images de sortie (1-30) |
| width | integer | No | `480` | Largeur de sortie en pixels (64-1280). La hauteur est mise à l'échelle proportionnellement |
| startS | number | No | `0` | Temps de début en secondes (doit être >= 0) |
| durationS | number | No | `5` | Durée en secondes (supérieure à 0, max 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Des valeurs plus faibles de `fps` et `width` produisent des fichiers GIF plus petits. Un GIF de 480px de large à 12 fps offre généralement un bon compromis.
- La durée maximale est de 60 secondes. Les clips plus longs produisent des fichiers très volumineux.
- Les mises à jour de progression sont disponibles via SSE sur `GET /api/v1/jobs/{jobId}/progress` jusqu'à la fin de la tâche.
