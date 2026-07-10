---
description: "Combinez une ou plusieurs images en un document PDF avec des options de taille de page, d'orientation et de taille de fichier cible."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: c653b9bdb92f
---

# Image vers PDF {#image-to-pdf}

Combinez une ou plusieurs images en un document PDF. Prend en charge plusieurs tailles de page, orientations, marges, et le ciblage facultatif de la taille de fichier via l'ajustement de la qualité.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Accepte des données de formulaire multipart avec une ou plusieurs images et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | Non | `"A4"` | Taille de page : `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Non | `"portrait"` | Orientation de la page : `portrait` ou `landscape` |
| margin | number | Non | `20` | Marge de page en points (0-500) |
| targetSize | object | Non | - | Contrainte de taille de fichier cible (voir ci-dessous) |
| collate | boolean | Non | `true` | Combiner toutes les images en un seul PDF. Si `false`, crée un PDF par image. |

### Objet Target Size {#target-size-object}

| Champ | Type | Requis | Description |
|-------|------|----------|-------------|
| value | number | Oui | Valeur de la taille cible |
| unit | string | Oui | Unité : `KB` ou `MB` |

La taille cible minimale est de 50 Ko.

## Exemple de requête {#example-request}

PDF multi-images de base :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Avec taille de fichier cible :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Un PDF par image :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Exemple de réponse (regroupée) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Exemple de réponse (non regroupée) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Exemple de réponse (avec taille cible) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Notes {#notes}

- Les images sont centrées sur la page et mises à l'échelle pour tenir dans les marges tout en préservant le rapport d'aspect. Les images ne sont jamais agrandies.
- Lorsque `collate` vaut `false`, chaque image devient un fichier PDF distinct, et le téléchargement est une archive ZIP contenant tous les PDF.
- La fonction de taille cible utilise une recherche binaire itérative sur les niveaux de qualité JPEG (10-95) pour trouver la meilleure qualité qui tienne dans le budget.
- Les images transparentes sont aplaties sur du blanc avant d'être intégrées au PDF.
- Formats d'entrée pris en charge : JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG, et plus.
- L'orientation EXIF est appliquée automatiquement avant l'intégration.
