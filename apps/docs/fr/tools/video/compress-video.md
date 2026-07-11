---
description: "Réduit la taille du fichier vidéo avec un contrôle de la qualité."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: a2709c27b052
---

# Compress Video {#compress-video}

Réduit la taille du fichier vidéo à l'aide d'une force de compression configurable et d'une réduction facultative de la résolution.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`. Il s'agit d'un point de terminaison asynchrone : il renvoie immédiatement `202 Accepted` et la progression est diffusée via SSE sur `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Force de compression : `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Résolution de sortie : `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Le préréglage `light` préserve une qualité proche de l'originale. Le préréglage `strong` réduit agressivement la taille du fichier au détriment de la fidélité visuelle.
- La réduction de la résolution (par exemple de 4K à 720p) se cumule avec la compression pour une réduction de taille importante.
- Les mises à jour de progression sont disponibles via SSE sur `GET /api/v1/jobs/{jobId}/progress` jusqu'à la fin de la tâche.
