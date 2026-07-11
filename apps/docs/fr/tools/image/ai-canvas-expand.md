---
description: "Agrandit le canevas d'une image par outpainting IA, en l'étendant dans n'importe quelle direction et en remplissant les nouvelles zones pour qu'elles correspondent à l'original."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: ae4b5a0d8556
---

# Agrandissement de canevas par IA {#ai-canvas-expand}

Agrandit le canevas d'une image grâce à un remplissage assisté par IA (outpainting). Étend l'image dans n'importe quelle direction et remplit les nouvelles zones avec un contenu généré par IA qui correspond à l'image existante.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour connaître le statut via SSE)

**Bundle de modèles :** `object-eraser-colorize` (1 à 2 Go)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| file | fichier | Oui | - | Fichier image (multipart) |
| extendTop | entier | Non | `0` | Pixels à ajouter en haut |
| extendRight | entier | Non | `0` | Pixels à ajouter à droite |
| extendBottom | entier | Non | `0` | Pixels à ajouter en bas |
| extendLeft | entier | Non | `0` | Pixels à ajouter à gauche |
| tier | chaîne | Non | `"balanced"` | Niveau de qualité : `fast`, `balanced`, `high` |
| format | chaîne | Non | `"auto"` | Format de sortie : `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | entier | Non | `95` | Qualité de sortie (1 à 100) |

Au moins une direction d'extension doit être supérieure à 0.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Réponse {#response}

### Réponse initiale (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progression (SSE sur `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Remarques {#notes}

- Nécessite l'installation du bundle de modèles `object-eraser-colorize` (1 à 2 Go).
- Utilise l'outpainting basé sur LaMa pour générer le contenu des régions agrandies.
- Le paramètre `tier` arbitre entre vitesse et qualité : `fast` produit des résultats rapidement, avec de possibles artefacts, tandis que `high` prend plus de temps mais produit des remplissages plus lisses et plus cohérents.
- Les valeurs d'extension sont en pixels. Les dimensions finales de l'image seront : largeur d'origine + extendLeft + extendRight par hauteur d'origine + extendTop + extendBottom.
- Pour les formats de sortie non prévisualisables dans le navigateur (HEIC, JXL, TIFF), un aperçu WebP est généré en parallèle de la sortie principale.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
