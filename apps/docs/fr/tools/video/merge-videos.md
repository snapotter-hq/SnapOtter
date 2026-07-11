---
description: "Assemble plusieurs clips vidéo en un seul fichier."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 711b7daad579
---

# Merge Videos {#merge-videos}

Assemble plusieurs clips vidéo en un seul fichier MP4. Toutes les entrées sont normalisées à la résolution de la première vidéo et à 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Accepte des données de formulaire multipart avec deux fichiers vidéo ou plus. Il s'agit d'un point de terminaison asynchrone : il renvoie immédiatement `202 Accepted` et la progression est diffusée via SSE sur `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

Cet outil n'a aucun paramètre de réglage. Téléversez 2 à 10 fichiers vidéo sous forme de plusieurs parties `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Les clips sont concaténés dans l'ordre où ils sont téléversés.
- Tous les clips sont réencodés pour correspondre à la résolution, à la fréquence d'images (30 fps) et au codec (H.264) du premier clip. Les entrées non concordantes sont automatiquement normalisées.
- Accepte 2 à 10 fichiers vidéo par requête.
- Les mises à jour de progression sont disponibles via SSE sur `GET /api/v1/jobs/{jobId}/progress` jusqu'à la fin de la tâche.
