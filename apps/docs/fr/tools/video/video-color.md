---
description: "Ajuste la luminosité, le contraste, la saturation et le gamma d'une vidéo."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: ef0c85417fbf
---

# Video Color {#video-color}

Ajuste la luminosité, le contraste, la saturation et la correction gamma d'une vidéo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Ajustement de la luminosité (-1 à 1) |
| contrast | number | No | `1` | Multiplicateur de contraste (0-4) |
| saturation | number | No | `1` | Multiplicateur de saturation (0-3). Mettre à 0 pour un rendu en niveaux de gris |
| gamma | number | No | `1` | Correction gamma (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Toutes les valeurs à leurs valeurs par défaut (luminosité 0, contraste 1, saturation 1, gamma 1) ne produisent aucun changement.
- Régler la saturation sur `0` convertit la vidéo en niveaux de gris.
- Les valeurs de gamma inférieures à 1 éclaircissent les ombres, tandis que les valeurs supérieures à 1 les assombrissent.
