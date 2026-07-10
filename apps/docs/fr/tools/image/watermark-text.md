---
description: "Ajoute des filigranes de texte avec une position, une opacité, une rotation et un motif en mosaïque configurables."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 7ff94835c0c3
---

# Filigrane texte {#text-watermark}

Ajoute une superposition de filigrane de texte aux images. Prend en charge un placement unique dans les coins/au centre ou une répétition en mosaïque sur toute l'image, avec une taille de police, une couleur, une opacité et une rotation configurables.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| text | string | Oui | - | Texte du filigrane (1 à 500 caractères) |
| fontSize | number | Non | `48` | Taille de police en pixels (8 à 1000) |
| color | string | Non | `"#000000"` | Couleur du texte au format hexadécimal (`#RRGGBB`) |
| opacity | number | Non | `50` | Pourcentage d'opacité du texte (0 à 100) |
| position | string | Non | `"center"` | Placement : `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Non | `0` | Angle de rotation du texte en degrés (-360 à 360) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Filigrane en mosaïque sur toute l'image :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Remarques {#notes}

- Le filigrane est rendu sous forme de texte SVG et composité sur l'image, préservant la qualité de sortie.
- Le mode mosaïque espace les éléments de texte en fonction de la taille de police (espacement horizontal de 6x, vertical de 4x), plafonné à un maximum de 500 éléments.
- Pour les positions dans les coins, la marge par rapport au bord est égale à la taille de police.
- La police utilisée est la police sans empattement par défaut du système.
- Les caractères spéciaux XML dans le texte (`&`, `<`, `>`, `"`, `'`) sont échappés de manière sûre.
- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
