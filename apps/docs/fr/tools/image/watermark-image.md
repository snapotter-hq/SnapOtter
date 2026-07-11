---
description: "Superpose un logo ou une image comme filigrane avec une position, une opacité et une échelle configurables."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: d1aa84c44012
---

# Filigrane image {#image-watermark}

Superpose un logo ou une image secondaire comme filigrane sur une image de base. Le filigrane est mis à l'échelle par rapport à la largeur de l'image de base et positionné dans un coin ou au centre.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Accepte des données de formulaire multipart avec **deux** fichiers image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| position | string | Non | `"bottom-right"` | Placement du filigrane : `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | Non | `50` | Pourcentage d'opacité du filigrane (0 à 100) |
| scale | number | Non | `25` | Largeur du filigrane en pourcentage de la largeur de l'image principale (1 à 100) |

### Champs de fichier {#file-fields}

| Nom du champ | Requis | Description |
|------------|----------|-------------|
| file | Oui | L'image principale/de base |
| watermark | Oui | L'image du filigrane/logo |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Remarques {#notes}

- Les deux images sont validées et décodées (HEIC, RAW, PSD, SVG pris en charge).
- Le filigrane est redimensionné proportionnellement afin que sa largeur soit égale à `scale` % de la largeur de l'image principale.
- L'opacité est appliquée via un masque alpha composité avec un mélange `dest-in`.
- Les positions dans les coins utilisent une marge de 20 px par rapport au bord de l'image.
- Si l'image du filigrane comporte de la transparence (par exemple un logo PNG), celle-ci est préservée lors de la composition.
- L'orientation EXIF est appliquée automatiquement sur les deux images avant le traitement.
