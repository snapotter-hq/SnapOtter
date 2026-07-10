---
description: "Retirez les objets indésirables des images avec l'inpainting par IA (LaMa), guidé par un masque de la région à effacer."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: ab0ab3426de6
---

# Gomme d'objets {#object-eraser}

Retirez les objets indésirables des images à l'aide de l'inpainting par IA (modèle LaMa). Accepte une image et un masque indiquant la région à effacer.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour le statut via SSE)

**Bundle de modèle :** `object-eraser-colorize` (1-2 Go)

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image source (multipart) |
| mask | file | Oui | - | Image de masque (blanc = zone à effacer, noir = à conserver). Doit être téléversée avec le nom de champ `mask` |
| format | string | Non | `"auto"` | Format de sortie : `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Non | `95` | Qualité de sortie (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notes {#notes}

- Nécessite l'installation du bundle de modèle `object-eraser-colorize` (1-2 Go).
- Le masque doit avoir les mêmes dimensions que l'image source. Les pixels blancs indiquent les zones à effacer ; l'IA les remplit avec un contenu plausible.
- Utilise LaMa (Large Mask Inpainting) pour une suppression d'objets de haute qualité.
- Pour les formats de sortie non prévisualisables dans le navigateur, un aperçu WebP est généré en parallèle de la sortie principale.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR par décodage automatique.
