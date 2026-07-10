---
description: "Restaurez et affinez les visages flous ou de faible qualité dans les images avec les modèles d'IA GFPGAN et CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: b1e13e3878c2
---

# Amélioration des visages {#face-enhancement}

Restaurez et améliorez les visages dans les images à l'aide de modèles d'IA (GFPGAN/CodeFormer).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour le statut via SSE)

**Bundles de modèles :** `upscale-enhance` (5-6 Go) et `face-detection` (200-300 Mo)

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| model | string | Non | `"auto"` | Modèle à utiliser : `auto`, `gfpgan`, `codeformer` |
| strength | number | Non | `0.8` | Force de l'amélioration (0-1). Les valeurs plus élevées produisent une amélioration plus forte |
| onlyCenterFace | boolean | Non | `false` | N'améliorer que le visage le plus central/proéminent |
| sensitivity | number | Non | `0.5` | Sensibilité de la détection des visages (0-1) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notes {#notes}

- Nécessite à la fois le bundle de modèle `upscale-enhance` (5-6 Go) et le bundle de modèle `face-detection` (200-300 Mo).
- GFPGAN produit une amélioration plus agressive ; CodeFormer préserve mieux l'identité. `auto` sélectionne le meilleur modèle pour l'entrée.
- La sortie est toujours au format PNG pour une qualité maximale.
- Un aperçu WebP est généré en parallèle de la sortie pleine résolution pour un affichage plus rapide côté frontal.
- Le paramètre `strength` mélange le visage amélioré avec l'original. Utilisez des valeurs plus basses (0.3-0.5) pour des améliorations subtiles, des valeurs plus élevées (0.7-1.0) pour une restauration plus forte.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR par décodage automatique.
