---
description: "Convertit des fichiers SVG en PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF ou JXL à une résolution et un DPI personnalisés, avec prise en charge du traitement par lots."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: a6e8da9762e7
---

# SVG vers image matricielle {#svg-to-raster}

Convertit des fichiers SVG en formats d'image matricielle (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF ou JXL) à une résolution et un DPI personnalisés. Prend également en charge la conversion par lots de plusieurs SVG.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Non | - | Largeur cible en pixels (1 à 65536). Conserve le rapport d'aspect si une seule dimension est définie. |
| height | integer | Non | - | Hauteur cible en pixels (1 à 65536). Conserve le rapport d'aspect si une seule dimension est définie. |
| dpi | integer | Non | 300 | DPI de rendu, contrôle la densité de rastérisation de base (36 à 2400) |
| quality | number | Non | 90 | Qualité de sortie pour les formats avec perte (1 à 100) |
| backgroundColor | string | Non | `"#00000000"` | Couleur d'arrière-plan en hexadécimal (6 ou 8 caractères, la version à 8 caractères inclut l'alpha) |
| outputFormat | string | Non | `"png"` | Format de sortie : `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Point d'accès de traitement par lots {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Convertit plusieurs fichiers SVG en une seule requête. Renvoie une archive ZIP.

### Paramètres supplémentaires pour le lot {#additional-batch-parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Non | - | Identifiant de tâche facultatif fourni par le client pour le suivi de la progression (max 128 caractères) |

### Exemple de requête par lots {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Réponse du lot {#batch-response}

Le point d'accès de traitement par lots diffuse directement un fichier ZIP avec les en-têtes :
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Remarques {#notes}

- N'accepte que les fichiers SVG et SVGZ (valide le contenu, pas seulement l'extension). Les fichiers SVGZ sont automatiquement décompressés.
- Le contenu SVG est nettoyé avant le rendu pour empêcher les attaques XSS et le chargement de ressources externes.
- Le réglage `dpi` contrôle la densité à laquelle le SVG est rastérisé. Un DPI plus élevé produit des dimensions en pixels plus grandes à partir de la même zone d'affichage SVG.
- Lorsque `width` et `height` sont tous deux fournis, l'image est redimensionnée à l'aide de `fit: inside` (conserve le rapport d'aspect dans les limites).
- Un `previewUrl` est inclus dans la réponse pour les formats que les navigateurs ne peuvent pas afficher nativement (TIFF, HEIF). L'aperçu est une vignette WebP de 1200 px.
- L'arrière-plan par défaut `#00000000` est entièrement transparent. Définissez-le sur `#FFFFFF` pour un arrière-plan blanc (utile avec une sortie JPEG qui ne prend pas en charge la transparence).
- Le traitement par lots respecte la configuration serveur `MAX_BATCH_SIZE` et utilise des workers concurrents pour de meilleures performances.
- La progression des opérations par lots peut être suivie via SSE sur `/api/v1/jobs/:jobId/progress`.
