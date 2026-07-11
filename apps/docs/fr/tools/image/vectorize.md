---
description: "Convertit des images matricielles en SVG avec une vectorisation en noir et blanc (potrace) et une vectorisation multicalque en couleur."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: ccc108d8abc5
---

# Image vers SVG {#image-to-svg}

Vectorise des images matricielles en SVG à l'aide d'algorithmes de tracé. Prend en charge le tracé en noir et blanc (potrace) et la vectorisation multicalque en couleur.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| colorMode | string | Non | `"bw"` | Mode de tracé : `bw` (noir et blanc) ou `color` (calques multicolores) |
| threshold | number | Non | 128 | Seuil de luminosité pour le mode N&B (0 à 255). Les pixels en dessous deviennent noirs. |
| colorPrecision | number | Non | 6 | Précision de la quantification des couleurs pour le mode couleur (1 à 16). Des valeurs plus élevées produisent des calques de couleur plus distincts. |
| layerDifference | number | Non | 6 | Différence de couleur minimale entre les calques en mode couleur (1 à 128) |
| filterSpeckle | number | Non | 4 | Surface minimale des formes tracées en pixels (1 à 256). Supprime le bruit et les taches. |
| pathMode | string | Non | `"spline"` | Lissage des tracés : `none` (irrégulier), `polygon` (segments droits), `spline` (courbes lisses) |
| cornerThreshold | number | Non | 60 | Seuil d'angle pour la détection des coins en mode couleur (0 à 180 degrés) |
| invert | boolean | Non | `false` | Inverse l'image avant le tracé (échange noir/blanc) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Vectorisation en couleur {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Remarques {#notes}

- La sortie est toujours un fichier SVG, quel que soit le format d'entrée.
- Prend en charge les formats d'entrée HEIC, RAW, PSD et SVG (décodés automatiquement en matriciel avant le tracé).
- Le mode N&B utilise l'algorithme potrace. L'image est d'abord convertie en niveaux de gris, puis seuillée en noir/blanc pur avant le tracé.
- Le mode couleur utilise une approche multicalque : l'image est quantifiée en calques de couleur, chacun tracé séparément et empilé dans la sortie SVG.
- Des valeurs `filterSpeckle` plus faibles préservent davantage de détails mais produisent des fichiers SVG plus volumineux comportant plus de tracés.
- Le réglage `pathMode` influence considérablement la taille du fichier : `none` produit le plus de tracés, `spline` produit la sortie la plus lisse (et généralement la plus petite).
- Pour de meilleurs résultats avec des logos et des icônes, utilisez le mode N&B avec une entrée nette et à fort contraste. Pour les photographies ou les illustrations, utilisez le mode couleur avec un `colorPrecision` plus élevé.
