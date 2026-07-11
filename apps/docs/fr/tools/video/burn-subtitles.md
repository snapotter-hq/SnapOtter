---
description: "Incruste définitivement les sous-titres sur les images de la vidéo."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 0f0b74444bfe
---

# Burn Subtitles {#burn-subtitles}

Incruste définitivement (en dur) les sous-titres d'un fichier SRT, VTT ou ASS sur chaque image d'une vidéo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Accepte des données de formulaire multipart avec un fichier vidéo et un fichier de sous-titres. Il s'agit d'un point de terminaison asynchrone : il renvoie immédiatement `202 Accepted` et la progression est diffusée via SSE sur `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Taille de police des sous-titres en pixels (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Téléversez deux fichiers : le premier doit être une vidéo, le second doit être un fichier de sous-titres (.srt, .vtt ou .ass).
- Les sous-titres incrustés font partie intégrante de la vidéo et ne peuvent pas être désactivés par le spectateur. Pour des sous-titres activables, utilisez plutôt l'outil Embed Subtitles.
- Les mises à jour de progression sont disponibles via SSE sur `GET /api/v1/jobs/{jobId}/progress` jusqu'à la fin de la tâche.
