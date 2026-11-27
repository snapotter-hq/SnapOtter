---
description: "Transforme un ensemble d'images en une vidéo diaporama, un GIF animé ou un WebP animé."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 9625d333aea0
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Transforme un ensemble d'images en une vidéo diaporama avec une durée par image, une résolution et une fréquence d'images configurables, ou en un GIF ou WebP animé avec un temps fixe par image et un nombre de boucles.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Accepte des données de formulaire multipart avec deux fichiers image ou plus et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Format de sortie : `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | MP4 uniquement. Durée d'affichage par image en secondes (0.5-10) |
| resolution | string | No | `"720p"` | MP4 uniquement. Résolution de sortie : `1080p`, `720p`, `square` |
| fps | integer | No | `30` | MP4 uniquement. Fréquence d'images de sortie (10-60) |
| frameDelayMs | integer | No | `500` | GIF et WebP uniquement. Durée d'affichage de chaque image, en millisecondes (20-10000) |
| loop | integer | No | `0` | GIF et WebP uniquement. Nombre de lectures de l'animation ; `0` boucle indéfiniment (0-100) |

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

Pour créer un GIF animé qui affiche chaque image pendant 200 ms :

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- Pour le MP4, les images sont redimensionnées et complétées par un remplissage pour s'adapter à la résolution cible tout en préservant le rapport d'aspect.
- L'option de résolution `square` produit une vidéo 1080x1080, utile pour les réseaux sociaux.
- La sortie MP4 est en H.264, nommée `slideshow.mp4`.
- La sortie GIF et WebP utilise la taille de la première image. Les images d'autres tailles sont mises à l'échelle pour tenir à l'intérieur, et la zone restante est transparente. Le fichier est nommé `slideshow.gif` ou `slideshow.webp`.
- Le GIF stocke les durées d'image en centièmes de seconde, donc `frameDelayMs` est arrondi aux 10 ms les plus proches dans un GIF. Le WebP conserve la valeur exacte.
- Les grandes animations sont refusées plutôt que construites : la taille d'image multipliée par le nombre d'images doit rester sous la même limite de pixels que celle des outils GIF.
