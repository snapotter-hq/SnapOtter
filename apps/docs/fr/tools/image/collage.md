---
description: "Combinez plusieurs images en collages en grille avec plus de 25 modèles, des espacements et coins réglables, ainsi qu'un panoramique et un zoom par cellule."
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: d23b0c41aa81
---

# Collage / Grille {#collage-grid}

Combinez plusieurs images en superbes collages en grille avec plus de 25 modèles. Prend en charge les dispositions de 2 à 9 images avec espacement, rayon des coins, couleur d'arrière-plan et contrôles de panoramique/zoom par cellule personnalisables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | Oui | - | ID de la disposition du modèle (par ex. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Non | - | Tableau de réglages par cellule avec `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Oui | - | Index de l'image à placer dans cette cellule (base 0) |
| cells[].panX | number | Non | 0 | Décalage de panoramique horizontal (-100 à 100) |
| cells[].panY | number | Non | 0 | Décalage de panoramique vertical (-100 à 100) |
| cells[].zoom | number | Non | 1 | Niveau de zoom (1 à 10) |
| cells[].objectFit | string | Non | `"cover"` | Comment l'image remplit la cellule : `cover` ou `contain` |
| gap | number | Non | 8 | Espacement entre cellules en pixels (0 à 500) |
| cornerRadius | number | Non | 0 | Rayon des coins de chaque cellule en pixels (0 à 500) |
| backgroundColor | string | Non | `"#FFFFFF"` | Couleur d'arrière-plan en hexadécimal ou `"transparent"` |
| aspectRatio | string | Non | `"free"` | Rapport d'aspect du canevas : `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Non | `"png"` | Format de sortie : `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Non | 90 | Qualité de sortie (1 à 100) |

## Available Templates {#available-templates}

| ID du modèle | Images | Disposition |
|-------------|--------|--------|
| `2-h-equal` | 2 | Deux colonnes égales |
| `2-v-equal` | 2 | Deux rangées égales |
| `2-h-left-large` | 2 | Gauche 2/3, droite 1/3 |
| `2-h-right-large` | 2 | Gauche 1/3, droite 2/3 |
| `3-left-large` | 3 | Grande à gauche, deux empilées à droite |
| `3-right-large` | 3 | Deux empilées à gauche, grande à droite |
| `3-top-large` | 3 | Grande en haut, deux colonnes en bas |
| `3-h-equal` | 3 | Trois colonnes égales |
| `3-v-equal` | 3 | Trois rangées égales |
| `4-grid` | 4 | Grille 2x2 |
| `4-left-large` | 4 | Grande à gauche, trois empilées à droite |
| `4-top-large` | 4 | Grande en haut, trois colonnes en bas |
| `4-bottom-large` | 4 | Trois colonnes en haut, grande en bas |
| `5-top2-bottom3` | 5 | Deux en haut, trois en bas |
| `5-top3-bottom2` | 5 | Trois en haut, deux en bas |
| `5-left-large` | 5 | Grande à gauche, quatre empilées à droite |
| `5-center-large` | 5 | Grande au centre, quatre aux coins |
| `6-grid-2x3` | 6 | 2 colonnes x 3 rangées |
| `6-grid-3x2` | 6 | 3 colonnes x 2 rangées |
| `6-top-large` | 6 | Grande en haut, cinq colonnes en bas |
| `7-mosaic` | 7 | Disposition en mosaïque |
| `8-mosaic` | 8 | Disposition en mosaïque |
| `9-grid` | 9 | Grille 3x3 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notes {#notes}

- Téléversez plusieurs fichiers image dans la requête multipart. Les images sont attribuées aux cellules du modèle dans l'ordre de téléversement.
- Si plus d'images sont téléversées que le modèle n'en accepte, les images supplémentaires sont ignorées.
- Prend en charge les formats d'entrée HEIC, RAW, PSD et SVG (décodés automatiquement).
- La taille de base du canevas est de 2400 px sur le côté le plus long, mise à l'échelle selon le rapport d'aspect choisi.
- Lorsque `aspectRatio` vaut `"free"`, le canevas prend par défaut le rapport 4:3 (2400x1800).
- Les valeurs `panX`/`panY` par cellule décalent la fenêtre de recadrage à l'intérieur de la cellule. Une valeur de 100 déplace entièrement vers un bord, -100 vers l'autre.
- La couleur d'arrière-plan `"transparent"` n'est conservée qu'avec les formats de sortie `png`, `webp` ou `avif`.
