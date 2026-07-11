---
description: "Combine plusieurs images en une seule grille de feuille de sprites avec des métadonnées d'images."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: a29e105baeec
---

# Feuille de sprites {#sprite-sheet}

Combine plusieurs images en une seule grille de feuille de sprites. Chaque image est redimensionnée pour correspondre aux dimensions de la première image et placée dans la grille. Renvoie l'image de la feuille de sprites accompagnée des métadonnées de coordonnées par image.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Accepte des données de formulaire multipart avec deux fichiers image ou plus et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | Non | `4` | Nombre de colonnes de la grille (1-16) |
| padding | integer | Non | `0` | Marge entre les cellules en pixels (0-64) |
| background | string | Non | `"#ffffff"` | Couleur d'arrière-plan hexadécimale |
| format | string | Non | `"png"` | Format de sortie : `png`, `webp` ou `jpeg` |
| quality | integer | Non | `90` | Qualité de sortie (1-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Remarques {#notes}

- Accepte de 2 à 64 images. Toutes les images sont redimensionnées pour correspondre aux dimensions de la première image téléversée.
- Le tableau `frames` fournit les coordonnées en pixels exactes de chaque image dans la sortie, adaptées aux définitions de sprites CSS ou aux cartes d'images de moteur de jeu.
- Le nombre de lignes est calculé automatiquement à partir du nombre d'images et de la valeur `columns`.
- Utilisez le paramètre `padding` pour ajouter de l'espacement entre les cellules. La couleur `background` est visible dans les zones de marge et dans toute cellule finale vide.
- Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
