---
description: "Découpe une image en tuiles de grille selon des lignes et des colonnes ou selon une taille en pixels, renvoyées sous forme d'archive ZIP."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: bc8f0812ff9f
---

# Découper une image {#image-splitting}

Découpe une seule image en tuiles de grille selon un nombre de colonnes/lignes ou selon des dimensions en pixels précises. Renvoie une archive ZIP contenant toutes les tuiles.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/split`

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | Non | 3 | Nombre de colonnes de découpage (1 à 100) |
| rows | integer | Non | 3 | Nombre de lignes de découpage (1 à 100) |
| tileWidth | integer | Non | - | Largeur des tuiles en pixels (min 10). Remplace `columns` lorsque `tileWidth` et `tileHeight` sont tous deux définis. |
| tileHeight | integer | Non | - | Hauteur des tuiles en pixels (min 10). Remplace `rows` lorsque `tileWidth` et `tileHeight` sont tous deux définis. |
| outputFormat | string | Non | `"original"` | Format de sortie des tuiles : `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Non | 90 | Qualité de sortie pour les formats avec perte (1 à 100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Exemple de réponse {#example-response}

La réponse est diffusée directement sous forme de fichier ZIP avec `Content-Type: application/zip`. Le nom de fichier suit le modèle `split-<jobId>.zip`.

Chaque tuile à l'intérieur du ZIP est nommée `<originalBaseName>_r<row>_c<col>.<ext>` (par exemple `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Remarques {#notes}

- Accepte un seul fichier image.
- Prend en charge les formats d'entrée HEIC, RAW, PSD et SVG (décodés automatiquement).
- Lorsque `tileWidth` et `tileHeight` sont tous deux fournis, ils sont prioritaires sur `columns`/`rows`. Les dimensions de la grille sont calculées comme `ceil(imageWidth / tileWidth)` et `ceil(imageHeight / tileHeight)`.
- Les tuiles de bord (colonne la plus à droite, ligne du bas) peuvent être plus petites que la taille de tuile spécifiée si les dimensions de l'image ne sont pas divisibles de façon égale.
- La taille maximale de la grille est plafonnée à 100x100 (10 000 tuiles).
- La réponse diffuse le ZIP directement, il n'y a donc pas de corps de réponse JSON. Utilisez `--output` avec curl pour enregistrer le fichier.
