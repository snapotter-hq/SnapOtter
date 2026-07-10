---
description: "Met à l'échelle une vidéo vers une nouvelle résolution ou une taille prédéfinie."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: c8ec5b3a3d79
---

# Resize Video {#resize-video}

Met à l'échelle une vidéo vers une nouvelle résolution à l'aide de dimensions en pixels personnalisées ou d'un préréglage standard.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Largeur cible en pixels (16-7680) |
| height | integer | No | - | Hauteur cible en pixels (16-4320) |
| preset | string | No | `"custom"` | Préréglage de résolution : `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Lorsque `preset` vaut `"custom"`, au moins l'une des valeurs `width` ou `height` doit être fournie. L'autre dimension est mise à l'échelle proportionnellement.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Redimensionner vers des dimensions personnalisées :

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

- Les valeurs de préréglage correspondent à des hauteurs standard (par exemple `720p` = 1280x720, `1080p` = 1920x1080). La largeur est mise à l'échelle proportionnellement à partir du rapport d'aspect source.
- Les dimensions sont arrondies à des nombres pairs, comme l'exigent la plupart des codecs vidéo.
- La résolution maximale prise en charge est 7680x4320 (8K UHD).
