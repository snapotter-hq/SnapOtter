---
description: "Extrait la piste de sous-titres d'une vidéo sous forme de fichier SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 4f4e04376914
---

# Extract Subtitles {#extract-subtitles}

Extrait la piste de sous-titres intégrée d'un conteneur vidéo et la télécharge sous forme de fichier SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Accepte des données de formulaire multipart avec un fichier vidéo. Cet outil n'a aucun réglage configurable.

## Parameters {#parameters}

Cet outil n'a aucun paramètre. Il extrait la première piste de sous-titres trouvée dans le conteneur vidéo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- La vidéo doit contenir une piste de sous-titres intégrée. Si aucune piste de sous-titres n'est trouvée, la requête renvoie une erreur 400.
- Si la vidéo comporte plusieurs pistes de sous-titres, la première est extraite.
- Le format de sortie est SRT, quel que soit le format de sous-titres d'origine dans le conteneur.
