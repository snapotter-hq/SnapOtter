---
description: "Assemble des images côte à côte, empilées ou en grille, avec un contrôle de l'alignement, des espacements, des bordures et du mode de redimensionnement."
i18n_source_hash: 39333210505a
i18n_provenance: human
i18n_output_hash: 313c2611aaff
---

# Assemblage / Combinaison {#stitch-combine}

Assemble plusieurs images côte à côte, empilées verticalement ou disposées en grille. Prend en charge l'alignement, l'espacement, la bordure, le rayon des coins et plusieurs modes de redimensionnement.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| direction | string | Non | `"horizontal"` | Direction de la disposition : `horizontal`, `vertical`, `grid` |
| gridColumns | integer | Non | 2 | Nombre de colonnes lorsque la direction est `grid` (2 à 100) |
| resizeMode | string | Non | `"fit"` | Mode de redimensionnement des images : `fit`, `original`, `stretch`, `crop` |
| alignment | string | Non | `"center"` | Alignement transversal : `start`, `center`, `end` |
| gap | number | Non | 0 | Espacement entre les images en pixels (0 à 1000) |
| border | number | Non | 0 | Largeur de la bordure extérieure en pixels (0 à 500) |
| cornerRadius | number | Non | 0 | Rayon des coins appliqué à la sortie finale (0 à 500) |
| backgroundColor | string | Non | `"#FFFFFF"` | Couleur d'arrière-plan/bordure en hexadécimal (par exemple `#FF0000`) |
| format | string | Non | `"png"` | Format de sortie : `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Non | 90 | Qualité de sortie (1 à 100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Remarques {#notes}

- Nécessite au moins 2 images. Téléversez plusieurs fichiers image dans la requête multipart.
- Prend en charge les formats d'entrée HEIC, RAW, PSD et SVG (décodés automatiquement).
- Modes de redimensionnement :
  - `fit` - Met les images à l'échelle pour correspondre à la plus petite dimension le long de l'axe d'assemblage.
  - `original` - Conserve les tailles d'origine (peut produire des bords irréguliers).
  - `stretch` - Force les images à correspondre à la plus petite dimension sans conserver le rapport d'aspect.
  - `crop` - Recadre les images en mode couverture pour correspondre à la plus petite dimension.
- En mode `grid`, les cellules sont dimensionnées selon les dimensions médianes de toutes les images.
- Le `cornerRadius` est appliqué à l'ensemble de la sortie finale, et non aux images individuelles.
- La taille du canevas est limitée par la configuration serveur `MAX_CANVAS_PIXELS` afin d'éviter l'épuisement de la mémoire.
