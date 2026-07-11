---
description: "Remplace la piste audio d'une vidéo par un autre fichier."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: 0903f78deec1
---

# Replace Audio {#replace-audio}

Remplace la piste audio d'une vidéo par un fichier audio. Téléversez à la fois une vidéo et un fichier audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Accepte des données de formulaire multipart avec exactement deux fichiers : un fichier vidéo suivi d'un fichier audio.

## Parameters {#parameters}

Cet outil n'a aucun paramètre de réglage. Téléversez un fichier vidéo et un fichier audio sous forme de deux parties `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Exactement deux fichiers doivent être téléversés : le premier doit être une vidéo, le second doit être un fichier audio.
- Si le fichier audio est plus long que la vidéo, il est coupé pour correspondre à la durée de la vidéo. S'il est plus court, la vidéo restante est jouée en silence.
- Le flux vidéo est copié sans réencodage, il n'y a donc aucune perte de qualité vidéo.
