---
description: "Recadre une image en un cercle centré avec des coins transparents."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 2b7d2698264d
---

# Recadrage circulaire {#circle-crop}

Recadre une image en un cercle centré avec des coins transparents. Prend en charge le zoom, le décalage, la bordure et la taille de sortie réglables.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Accepte des données de formulaire multipart contenant un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| zoom | nombre | Non | `1` | Facteur de zoom (1 à 5) ; des valeurs plus élevées recadrent plus serré |
| offsetX | nombre | Non | `0.5` | Position horizontale du centre (0 à 1) |
| offsetY | nombre | Non | `0.5` | Position verticale du centre (0 à 1) |
| borderWidth | entier | Non | `0` | Épaisseur de la bordure en pixels (0 à 200) |
| borderColor | chaîne | Non | `"#ffffff"` | Couleur hex de la bordure |
| background | chaîne | Non | `"transparent"` | Remplissage des coins : `"transparent"` ou une couleur hex |
| outputSize | entier | Non | - | Dimension carrée finale en pixels (16 à 4096) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Remarques {#notes}

- La sortie est toujours au format PNG afin de préserver les coins transparents (sauf si `background` est défini sur une couleur unie).
- Le cercle est inscrit dans la dimension la plus courte de l'image. Utilisez `zoom` pour recadrer plus serré et `offsetX`/`offsetY` pour décaler la zone visible.
- Lorsque `outputSize` est fourni, le résultat est redimensionné à cette dimension carrée après le recadrage.
- Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
