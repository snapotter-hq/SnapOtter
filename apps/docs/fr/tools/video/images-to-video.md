---
description: "Transforme un ensemble d'images en une vidéo diaporama."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: d9c51a1bf4d8
---

# Images to Video {#images-to-video}

Transforme un ensemble d'images en une vidéo diaporama avec une durée par image, une résolution et une fréquence d'images configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Accepte des données de formulaire multipart avec deux fichiers image ou plus et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Durée d'affichage par image en secondes (0.5-10) |
| resolution | string | No | `"720p"` | Résolution de sortie : `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Fréquence d'images de sortie (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Accepte 2 à 60 fichiers image par requête. Les images apparaissent dans la vidéo dans l'ordre de téléversement.
- Les images sont redimensionnées et complétées par un remplissage pour s'adapter à la résolution cible tout en préservant le rapport d'aspect.
- L'option de résolution `square` produit une vidéo 1080x1080, utile pour les réseaux sociaux.
- Le format de sortie est toujours MP4 (H.264).
