---
description: "Colorisez automatiquement les photos en noir et blanc ou en niveaux de gris avec le modèle d'IA DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 50f583a22aff
---

# Colorisation par IA {#ai-colorization}

Convertissez les photos en noir et blanc ou en niveaux de gris en couleur complète à l'aide de l'IA (modèle DDColor avec repli sur OpenCV DNN).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour le statut via SSE)

**Bundle de modèle :** `object-eraser-colorize` (1-2 Go)

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| intensity | number | Non | `1.0` | Intensité des couleurs (0-1). Les valeurs plus basses produisent une colorisation plus subtile |
| model | string | Non | `"auto"` | Modèle à utiliser : `auto`, `ddcolor`, `opencv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notes {#notes}

- Nécessite l'installation du bundle de modèle `object-eraser-colorize` (1-2 Go).
- DDColor produit des résultats de meilleure qualité mais est plus lent ; OpenCV DNN est plus rapide avec une qualité légèrement inférieure. `auto` utilise DDColor lorsqu'il est disponible, avec un repli sur OpenCV.
- Le paramètre `intensity` mélange l'original en niveaux de gris et le résultat colorisé par l'IA. Utilisez 1.0 pour une couleur complète, des valeurs plus basses pour un rendu vintage partiellement désaturé.
- Le format de sortie correspond automatiquement au format d'entrée.
- Pour les formats de sortie non prévisualisables dans le navigateur, un aperçu WebP est généré en parallèle de la sortie principale.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR par décodage automatique.
