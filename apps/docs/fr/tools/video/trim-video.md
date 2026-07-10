---
description: "Découpe un clip d'une vidéo en spécifiant les temps de début et de fin."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 4d4de37910ca
---

# Trim Video {#trim-video}

Découpe un clip d'une vidéo en spécifiant les temps de début et de fin en secondes, avec une option pour des coupes précises à l'image près.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Temps de début en secondes (doit être >= 0) |
| endS | number | Yes | - | Temps de fin en secondes (doit être postérieur à startS) |
| precise | boolean | No | `false` | Réencode pour des coupes précises à l'image près au lieu d'une recherche par image clé |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Lorsque `precise` vaut `false` (par défaut), l'outil utilise la recherche par image clé, qui est rapide mais peut commencer quelques images avant le temps demandé.
- Définir `precise` sur `true` réencode le segment pour des limites d'image exactes, mais prend plus de temps.
- La valeur `endS` doit être supérieure à `startS`.
