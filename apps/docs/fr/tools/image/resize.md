---
description: Redimensionnez les images en pixels, en pourcentage ou avec des modes d'ajustement.
i18n_source_hash: 00d1bffa4d38
i18n_provenance: human
i18n_output_hash: 8e0697d78a16
---

# Redimensionner {#resize}

Redimensionnez les images en spécifiant des dimensions exactes en pixels, un facteur d'échelle en pourcentage ou un mode d'ajustement qui contrôle la façon dont l'image s'adapte aux dimensions cibles.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/resize`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Non | - | Largeur cible en pixels (max 16383) |
| height | integer | Non | - | Hauteur cible en pixels (max 16383) |
| fit | string | Non | `"contain"` | Comment l'image s'ajuste aux dimensions : `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | Non | `false` | Empêcher l'agrandissement si l'image est plus petite que la cible |
| percentage | number | Non | - | Mettre à l'échelle par pourcentage (par exemple 50 pour la moitié de la taille) |

Au moins l'un de `width`, `height` ou `percentage` doit être fourni.

### Modes d'ajustement {#fit-modes}

- **contain** - Redimensionner pour tenir dans les dimensions, en préservant le rapport d'aspect (peut laisser de l'espace vide)
- **cover** - Redimensionner pour couvrir les dimensions, en préservant le rapport d'aspect (peut recadrer)
- **fill** - Étirer pour correspondre exactement aux dimensions (ignore le rapport d'aspect)
- **inside** - Comme `contain`, mais réduit uniquement, n'agrandit jamais
- **outside** - Comme `cover`, mais réduit uniquement, n'agrandit jamais

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Redimensionner par pourcentage :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Remarques {#notes}

- La dimension maximale est de 16383 pixels sur chaque axe (limite de Sharp/libvips).
- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
- L'orientation EXIF est appliquée automatiquement avant le redimensionnement.
- L'indicateur `withoutEnlargement` est utile pour le traitement par lots où certaines images peuvent déjà être plus petites que la cible.
