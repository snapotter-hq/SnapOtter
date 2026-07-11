---
description: "Lit un clip vidéo à l'envers."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 06cd0ece1e18
---

# Reverse Video {#reverse-video}

Lit un clip vidéo à l'envers. La piste audio est également inversée.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Accepte des données de formulaire multipart avec un fichier vidéo. Cet outil n'a aucun réglage configurable.

## Parameters {#parameters}

Cet outil n'a aucun paramètre. Il inverse la vidéo entière.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- Limité aux clips d'une durée maximale de 5 minutes. Les vidéos plus longues sont rejetées avec une erreur 400.
- Les pistes vidéo et audio sont toutes deux inversées. Pour inverser la vidéo sans l'audio, coupez le son au préalable.
