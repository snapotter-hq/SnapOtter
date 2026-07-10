---
description: "Incruste un filigrane texte sur les images de la vidéo."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 0a8884b28a29
---

# Watermark Video {#watermark-video}

Incruste un filigrane texte sur chaque image d'une vidéo avec une position, une taille, une opacité et une couleur configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Texte du filigrane (1-200 caractères) |
| position | string | No | `"br"` | Position sur l'image : `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Taille de police en pixels (8-120) |
| opacity | number | No | `0.5` | Opacité du filigrane (0.05-1) |
| color | string | No | `"#ffffff"` | Couleur hexadécimale du texte (par exemple `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - En haut à gauche, **tc** - En haut au centre, **tr** - En haut à droite
- **l** - Au milieu à gauche, **c** - Au centre, **r** - Au milieu à droite
- **bl** - En bas à gauche, **bc** - En bas au centre, **br** - En bas à droite

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
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

- Le filigrane est incrusté définitivement dans les images de la vidéo et ne peut pas être retiré après le traitement.
- Le filigrane utilise une police sans empattement intégrée à FFmpeg.
- Pour les filigranes image, utilisez plutôt l'outil image Watermark.
