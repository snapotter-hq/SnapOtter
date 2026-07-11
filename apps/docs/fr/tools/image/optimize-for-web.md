---
description: "Optimisez les images pour le web avec conversion de format, contrôle de la qualité, redimensionnement et suppression des métadonnées."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 9a95297b2977
---

# Optimiser pour le web {#optimize-for-web}

Optimisez les images pour la diffusion sur le web en une seule étape. Combine conversion de format, ajustement de la qualité, redimensionnement facultatif, encodage progressif et suppression des métadonnées.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

Un point de terminaison d'aperçu en direct est également disponible à `POST /api/v1/tools/image/optimize-for-web/preview`, qui renvoie l'image traitée directement au format binaire (sans création d'espace de travail) pour un réglage des paramètres en temps réel.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Non | `"webp"` | Format de sortie : `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | Non | `80` | Qualité de sortie (1-100) |
| maxWidth | number | Non | - | Largeur maximale en pixels. L'image est réduite si elle est plus large. |
| maxHeight | number | Non | - | Hauteur maximale en pixels. L'image est réduite si elle est plus haute. |
| progressive | boolean | Non | `true` | Activer l'encodage progressif/entrelacé |
| stripMetadata | boolean | Non | `true` | Supprimer les métadonnées EXIF, GPS, ICC et XMP |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Optimiser en AVIF avec une compression agressive :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Réponse du point de terminaison d'aperçu {#preview-endpoint-response}

Le point de terminaison d'aperçu (`/api/v1/tools/image/optimize-for-web/preview`) renvoie l'image binaire directement avec des en-têtes informatifs :

- `X-Original-Size` - Taille du fichier d'origine en octets
- `X-Processed-Size` - Taille du fichier traité en octets
- `X-Output-Filename` - Nom du fichier de sortie encodé en URL

## Remarques {#notes}

- Cet outil est conçu comme un pipeline d'optimisation unique pour les ressources web. Il gère la conversion de format, l'ajustement de la qualité, le plafonnement des dimensions maximales et la suppression des métadonnées en une seule passe.
- L'extension du nom de fichier de sortie est mise à jour pour correspondre au format choisi.
- L'encodage JXL (JPEG XL) utilise un encodeur CLI spécialisé. L'image est d'abord traitée en PNG, puis encodée en JXL.
- L'encodage progressif améliore le temps de chargement perçu pour JPEG et PNG en permettant aux navigateurs d'afficher un aperçu de faible qualité avant le chargement complet de l'image.
- Le point de terminaison d'aperçu est plus léger (pas de création d'espace de travail ni de tâche) et est destiné à l'interface de réglage des paramètres en direct du frontend.
