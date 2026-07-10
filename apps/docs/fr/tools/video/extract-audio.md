---
description: "Extrait la piste audio d'une vidéo."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 34c9cc8b7e46
---

# Extract Audio {#extract-audio}

Extrait la piste audio d'un fichier vidéo et l'enregistre au format MP3, WAV, M4A ou OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Format audio de sortie : `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Si la vidéo n'a pas de piste audio, la requête renvoie une erreur 400.
- Le MP3 est avec perte mais largement compatible. Le WAV est sans perte mais volumineux. Le M4A (AAC) offre un bon compromis entre qualité et taille. L'OGG est disponible pour les workflows de codecs ouverts.
- Lorsque l'audio source est déjà en AAC et que le format de sortie est M4A, le flux audio est copié sans réencodage.
