---
description: "Convertissez un GIF animé en WebP et inversement, en préservant toutes les images."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: fe9deb409003
---

# Convertisseur GIF/WebP {#gif-webp-converter}

Convertissez des fichiers GIF animés en WebP et inversement, en préservant toutes les images et le timing de l'animation. Les animations WebP sont généralement 25 à 35 % plus petites que les GIF équivalents.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Accepte des données de formulaire multipart avec un fichier GIF ou WebP et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| quality | integer | Non | `80` | Qualité de sortie pour l'encodage WebP (1-100) |
| lossless | boolean | Non | `false` | Utiliser la compression WebP sans perte |
| resizePercent | integer | Non | `100` | Mettre la sortie à l'échelle par pourcentage (10-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Notes {#notes}

- Seuls les fichiers `.gif` et `.webp` sont acceptés. Les autres formats d'image ne sont pas pris en charge par cet outil.
- Le sens de la conversion est automatique : une entrée GIF produit une sortie WebP, et une entrée WebP produit une sortie GIF.
- Les options `quality` et `lossless` ne s'appliquent que lors de l'encodage en WebP. Lors de la conversion en GIF, la sortie utilise la palette GIF standard.
- Utilisez `resizePercent` pour réduire les dimensions (et la taille de fichier) des grandes animations.
