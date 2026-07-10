---
description: "Convertir des pages PDF en images de haute qualité."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: e4895e5ed780
---

# PDF vers image {#pdf-to-image}

Convertissez des pages PDF en images matricielles de haute qualité. Prend en charge la sélection de pages, plusieurs formats de sortie, le contrôle du DPI et les modes colorimétriques. Comprend des sous-routes d'information et d'aperçu pour inspecter les PDF avant la conversion.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Non | `"png"` | Format de sortie : `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | Non | 150 | Résolution de rendu (36 à 2400). Un DPI plus élevé produit des images plus grandes et plus détaillées. |
| quality | number | Non | 85 | Qualité de sortie pour les formats avec perte (1 à 100) |
| colorMode | string | Non | `"color"` | Mode colorimétrique : `color`, `grayscale`, `bw` (seuil noir et blanc) |
| pages | string | Non | `"all"` | Sélection de pages : `all`, page unique (`3`), plage (`1-5`), ou séparées par des virgules (`1,3,5-8`) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Sous-route d'information {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Renvoie le nombre de pages d'un PDF sans effectuer le rendu d'aucune page.

### Requête d'information {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Réponse d'information {#info-response}

```json
{
  "pageCount": 10
}
```

## Sous-route d'aperçu {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Renvoie des miniatures JPEG basse résolution de toutes les pages sous forme d'URL de données base64. Utile pour construire une interface de sélection de pages.

### Requête d'aperçu {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Réponse d'aperçu {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Remarques {#notes}

- Utilise MuPDF pour le rendu des PDF, offrant une sortie haute fidélité avec un rendu de police et des graphiques vectoriels corrects.
- Les PDF protégés par mot de passe ne sont pas pris en charge et renverront une erreur 400.
- Le paramètre `pages` prend en charge une syntaxe flexible :
  - `"all"` ou `""` - toutes les pages
  - `"3"` - page unique
  - `"1-5"` - plage de pages (inclusive)
  - `"1,3,5-8"` - pages individuelles et plages combinées
- Les numéros de page commencent à 1. Spécifier des pages au-delà de la longueur du document renvoie une erreur 400.
- Le point de terminaison principal génère toujours à la fois les téléchargements de pages individuelles et un ZIP contenant toutes les pages sélectionnées.
- Le point de terminaison d'aperçu effectue le rendu à 72 DPI et met à l'échelle à 300 px de largeur pour une génération rapide de miniatures. Les miniatures sont en JPEG à 60 % de qualité.
- Le point de terminaison d'aperçu respecte la configuration serveur `MAX_PDF_PAGES`, limitant le nombre de miniatures générées.
- Pour les documents volumineux à haut DPI, le temps de traitement augmente proportionnellement. Envisagez d'utiliser un DPI plus bas (150) pour un usage web et un DPI plus élevé (300-600) pour l'impression.
