---
description: "Réparez les rayures, déchirures et dommages des vieilles photos grâce à un pipeline IA de restauration, d'amélioration des visages et de mise en couleur."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 2801f852a8f7
---

# Restauration de photos {#photo-restoration}

Corrigez les rayures, déchirures et dommages des vieilles photos à l'aide d'un pipeline IA multi-étapes. Combine réparation des rayures, amélioration des visages, débruitage et mise en couleur optionnelle.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour connaître l'état via SSE)

**Ensemble de modèles :** `photo-restoration` (4-5 Go)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| scratchRemoval | boolean | Non | `true` | Supprimer les rayures et les dommages de surface |
| faceEnhancement | boolean | Non | `true` | Améliorer les visages dans la photo restaurée |
| fidelity | number | Non | `0.7` | Fidélité de l'amélioration des visages (0-1). Des valeurs plus élevées préservent davantage les traits d'origine |
| denoise | boolean | Non | `true` | Appliquer un débruitage au résultat restauré |
| denoiseStrength | number | Non | `25` | Intensité du débruitage (0-100) |
| colorize | boolean | Non | `false` | Mettre en couleur la photo restaurée (pour les images en niveaux de gris) |
| colorizeStrength | number | Non | `85` | Intensité de la mise en couleur (0-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
```

## Réponse {#response}

### Réponse initiale (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progression (SSE à `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Remarques {#notes}

- Nécessite l'installation de l'ensemble de modèles `photo-restoration` (4-5 Go).
- Le pipeline exécute plusieurs étapes IA de façon séquentielle : réparation des rayures, amélioration des visages (GFPGAN), débruitage et, en option, mise en couleur.
- Le tableau `steps` dans le résultat indique quelles étapes de traitement ont réellement été exécutées.
- `scratchCoverage` est un pourcentage estimé de la surface de l'image présentant des dommages par rayures.
- `fidelity` contrôle l'intensité de l'amélioration des visages par rapport à la préservation de l'apparence d'origine. Des valeurs plus basses produisent une amélioration plus agressive ; des valeurs plus élevées sont plus conservatrices.
- L'option `colorize` détecte automatiquement si l'image est en niveaux de gris. L'indicateur `isGrayscale` dans le résultat confirme cette détection.
- Le format de sortie correspond automatiquement au format d'entrée.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR, HDR et AVIF via un décodage automatique.
