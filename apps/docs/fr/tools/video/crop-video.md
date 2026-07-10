---
description: "Recadre une région d'une vidéo."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 2094f1b77eb2
---

# Crop Video {#crop-video}

Recadre une région rectangulaire d'une vidéo en spécifiant la taille et la position de la région.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Largeur de la région de recadrage en pixels (minimum 16) |
| height | integer | Yes | - | Hauteur de la région de recadrage en pixels (minimum 16) |
| x | integer | No | `0` | Décalage horizontal par rapport au coin supérieur gauche |
| y | integer | No | `0` | Décalage vertical par rapport au coin supérieur gauche |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- La région de recadrage doit tenir dans les dimensions de la vidéo. Si `x + width` ou `y + height` dépasse la taille source, la requête renvoie une erreur 400.
- La taille de recadrage minimale est de 16x16 pixels.
- Les dimensions sont arrondies à des nombres pairs, comme l'exigent la plupart des codecs vidéo.
