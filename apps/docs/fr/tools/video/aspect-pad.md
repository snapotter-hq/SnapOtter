---
description: "Ajouter des bandes de couleur unie pour s'adapter à un format d'image cible."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 0611a491555c
---

# Remplissage de format {#aspect-pad}

Ajoutez des bandes de letterbox ou de pillarbox de couleur unie pour adapter une vidéo à un format d'image cible sans rognage.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| target | string | Non | `"9:16"` | Format d'image cible : `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | Non | `"#000000"` | Couleur hexadécimale des bandes de remplissage (par exemple `"#000000"` pour le noir) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Remarques {#notes}

- Si la vidéo correspond déjà au format d'image cible, le fichier est renvoyé inchangé.
- Utilisez `9:16` pour les formats verticaux/portrait des réseaux sociaux (TikTok, Reels, Shorts).
- Pour un remplissage flou au lieu d'une couleur unie, utilisez l'outil Remplissage flou.
