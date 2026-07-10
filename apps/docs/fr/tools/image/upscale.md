---
description: "Agrandit les images de 2x à 4x avec la super-résolution par IA Real-ESRGAN tout en préservant les détails fins."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 8ed57e14fb4a
---

# Agrandissement d'image {#image-upscaling}

Amélioration par super-résolution IA à l'aide de Real-ESRGAN. Agrandit les images de 2x à 4x tout en préservant les détails.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Traitement :** asynchrone (renvoie 202, interroger `/api/v1/jobs/{jobId}/progress` pour le statut via SSE)

**Bundle de modèle :** `upscale-enhance` (5-6 Go)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| scale | number | Non | `2` | Facteur d'agrandissement (par exemple 2, 3, 4) |
| model | string | Non | `"auto"` | Modèle à utiliser (par exemple `auto`, noms de modèles spécifiques) |
| faceEnhance | boolean | Non | `false` | Applique une amélioration des visages pendant l'agrandissement |
| denoise | number | Non | `0` | Force du débruitage (0 = désactivé) |
| format | string | Non | `"auto"` | Format de sortie : `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Non | `95` | Qualité de sortie (1-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
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
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Remarques {#notes}

- Nécessite l'installation du bundle de modèle `upscale-enhance` (5-6 Go).
- Utilise Real-ESRGAN lorsqu'il est disponible ; revient à l'interpolation Lanczos si le modèle IA n'est pas disponible.
- L'option `faceEnhance` applique la restauration de visages GFPGAN pendant l'agrandissement pour une meilleure qualité des visages.
- Pour les formats de sortie non prévisualisables dans le navigateur (HEIC, JXL, TIFF), un aperçu WebP est généré en parallèle de la sortie principale.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
