---
description: "Remplir les bandes avec une copie floue de la vidéo."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: c8728e6d484f
---

# Remplissage flou {#blur-pad}

Adaptez une vidéo à un format d'image cible en remplissant la zone de remplissage avec une copie floue et mise à l'échelle de la vidéo, au lieu de bandes de couleur unie.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| target | string | Non | `"16:9"` | Format d'image cible : `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | Non | `20` | Sigma du flou gaussien pour l'arrière-plan (2-50) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Remarques {#notes}

- Des valeurs de flou plus élevées produisent un arrière-plan plus doux et plus abstrait. Des valeurs plus basses conservent plus de détails visibles.
- Si la vidéo correspond déjà au format d'image cible, le fichier est renvoyé inchangé.
- Pour un remplissage de couleur unie, utilisez plutôt l'outil Remplissage de format.
