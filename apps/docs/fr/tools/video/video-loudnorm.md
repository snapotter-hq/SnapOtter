---
description: "Normalise le volume audio de la vidéo selon la norme de diffusion."
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: 0f0b60162fcf
---

# Normaliser l’audio de la vidéo {#normalize-audio}

Normalise le volume audio de la vidéo selon la norme de sonie de diffusion EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Accepte des données de formulaire multipart avec un fichier vidéo. Cet outil n'a aucun réglage configurable.

## Parameters {#parameters}

Cet outil n'a aucun paramètre. Il applique la normalisation de sonie EBU R128 à la piste audio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Utilise le filtre `loudnorm` de FFmpeg ciblant une sonie intégrée de -16 LUFS avec un vrai pic de -1.5 dBTP et une plage de sonie de 11 LU (norme de diffusion EBU R128).
- La fréquence d'échantillonnage de l'audio source est conservée dans la sortie.
- Si la vidéo n'a pas de piste audio, la requête renvoie une erreur 400.
