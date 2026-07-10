---
description: "Suppression du bruit et du grain assistée par IA, avec plusieurs niveaux de qualité."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: e112d720d227
---

# Suppression du bruit {#noise-removal}

Suppression du bruit et du grain assistée par IA, avec plusieurs niveaux de qualité, à l'aide du sidecar Python (modèle SCUNet).

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour connaître l'état via SSE)

**Ensemble de modèles :** `upscale-enhance` (5-6 Go)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| tier | string | Non | `"balanced"` | Niveau de qualité : `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Non | `50` | Intensité du débruitage (0-100) |
| detailPreservation | number | Non | `50` | Quantité de détail à préserver (0-100). Des valeurs plus élevées conservent plus de texture |
| colorNoise | number | Non | `30` | Intensité de réduction du bruit chromatique (0-100) |
| format | string | Non | `"original"` | Format de sortie : `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Non | `90` | Qualité d'encodage de sortie (1-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Remarques {#notes}

- Nécessite l'installation de l'ensemble de modèles `upscale-enhance` (5-6 Go).
- Les niveaux de qualité arbitrent entre vitesse et qualité : `quick` est le plus rapide avec un débruitage de base, `maximum` utilise l'approche multipasse la plus poussée.
- Le paramètre `detailPreservation` est essentiel pour les sujets texturés (tissu, cheveux, feuillage). Des valeurs plus élevées empêchent le débruiteur de lisser les fins détails.
- Lorsque `format` est défini sur `"original"`, le format de sortie correspond au format du fichier d'entrée.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
