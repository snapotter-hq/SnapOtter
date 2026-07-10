---
description: "Supprime la piste audio d'une vidéo."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 5c222cea7c4a
---

# Mute Video {#mute-video}

Supprime la piste audio d'une vidéo, ne laissant que le flux visuel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Accepte des données de formulaire multipart avec un fichier vidéo. Cet outil n'a aucun réglage configurable.

## Parameters {#parameters}

Cet outil n'a aucun paramètre. Il supprime la piste audio de la vidéo téléversée.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Le flux vidéo est copié sans réencodage, il n'y a donc aucune perte de qualité.
- Si la vidéo d'entrée n'a pas de piste audio, le fichier est renvoyé inchangé.
