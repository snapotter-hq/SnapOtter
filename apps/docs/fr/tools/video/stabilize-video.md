---
description: "Réduit les tremblements de caméra grâce à une stabilisation en deux passes."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: daa1f7d1791e
---

# Stabilize Video {#stabilize-video}

Réduit les tremblements de caméra dans les séquences prises à main levée à l'aide de la stabilisation vidstab en deux passes de FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`. Il s'agit d'un point de terminaison asynchrone : il renvoie immédiatement `202 Accepted` et la progression est diffusée via SSE sur `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Taille de la fenêtre de lissage en images (5-60). Des valeurs plus élevées produisent un mouvement plus fluide |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- La stabilisation est un processus en deux passes : la première passe analyse le mouvement de la caméra, et la seconde applique la correction. Cela prend environ deux fois plus de temps que les outils à une seule passe.
- Des valeurs de lissage plus élevées éliminent davantage de tremblements mais peuvent introduire un léger recadrage par zoom sur les bords.
- Les mises à jour de progression sont disponibles via SSE sur `GET /api/v1/jobs/{jobId}/progress` jusqu'à la fin de la tâche.
