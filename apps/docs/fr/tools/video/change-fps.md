---
description: "Change la fréquence d'images d'une vidéo."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 7c6588a891b0
---

# Change FPS {#change-fps}

Change la fréquence d'images d'une vidéo vers une valeur cible comprise entre 1 et 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Fréquence d'images cible (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Réduire la fréquence d'images supprime des images et réduit la taille du fichier. L'augmenter duplique des images pour combler l'écart, mais n'ajoute pas de véritables détails de mouvement.
- Valeurs cibles courantes : 24 (cinéma), 30 (web/diffusion), 60 (lecture fluide).
- La piste audio est conservée à sa fréquence d'échantillonnage d'origine.
