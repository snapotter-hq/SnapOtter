---
description: "Extrait les images d'une vidéo sous forme de ZIP d'images."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: df502a36e5c0
---

# Video to Frames {#video-to-frames}

Extrait les images individuelles d'une vidéo et les télécharge sous forme d'archive ZIP d'images PNG ou JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Mode d'extraction : `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Extrait chaque Nième image (2-1000). Utilisé uniquement lorsque le mode est `"nth"` |
| timestamps | string | No | `""` | Horodatages en secondes séparés par des virgules. Requis lorsque le mode est `"timestamps"` |
| format | string | No | `"png"` | Format d'image pour les images extraites : `png`, `jpg` |

## Example Request {#example-request}

Extraire chaque 30e image en JPG :

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Extraire des images à des horodatages spécifiques :

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- Le mode `all` extrait chaque image et peut produire des fichiers ZIP très volumineux pour les longues vidéos. Utilisez le mode `nth` ou `timestamps` pour une extraction sélective.
- Le PNG préserve la qualité intégrale mais produit des fichiers plus volumineux. Le JPG est plus petit mais avec perte.
- La réponse est téléchargée sous forme d'archive ZIP contenant des fichiers image numérotés séquentiellement.
