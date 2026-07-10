---
description: "Convertit des vidéos entre MP4, MOV, WebM, AVI et MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: c01c65915056
---

# Convert Video {#convert-video}

Convertit des vidéos entre les formats MP4, MOV, WebM, AVI et MKV avec des préréglages de qualité configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`. Il s'agit d'un point de terminaison asynchrone : il renvoie immédiatement `202 Accepted` et la progression est diffusée via SSE sur `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Format de sortie : `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Préréglage de qualité : `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Le préréglage de qualité `high` produit la meilleure fidélité visuelle mais des fichiers plus volumineux. Le préréglage `small` compresse agressivement pour une taille de fichier minimale.
- La sortie WebM utilise l'encodage VP9. MP4 et MOV utilisent H.264. AVI et MKV sont disponibles pour les workflows hérités ou d'archivage.
- Les mises à jour de progression sont disponibles via SSE sur `GET /api/v1/jobs/{jobId}/progress` jusqu'à la fin de la tâche.
