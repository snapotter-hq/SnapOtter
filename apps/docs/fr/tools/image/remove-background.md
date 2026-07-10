---
description: "Suppression de l'arrière-plan assistée par IA avec effets optionnels (flou, ombre, dégradé, arrière-plan personnalisé)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: 58cb08d8414c
---

# Supprimer l'arrière-plan {#remove-background}

Suppression de l'arrière-plan assistée par IA avec effets optionnels (flou, ombre, dégradé, arrière-plan personnalisé).

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour connaître l'état via SSE)

**Ensemble de modèles :** `background-removal` (4-5 Go)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| model | string | Non | - | Variante de modèle IA à utiliser |
| backgroundType | string | Non | `"transparent"` | L'un de : `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Non | - | Couleur hexadécimale pour un arrière-plan uni |
| gradientColor1 | string | Non | - | Première couleur du dégradé |
| gradientColor2 | string | Non | - | Deuxième couleur du dégradé |
| gradientAngle | number | Non | - | Angle du dégradé en degrés |
| blurEnabled | boolean | Non | - | Activer l'effet de flou d'arrière-plan |
| blurIntensity | number | Non | - | Intensité du flou (0-100) |
| shadowEnabled | boolean | Non | - | Activer l'ombre portée sur le sujet |
| shadowOpacity | number | Non | - | Opacité de l'ombre (0-100) |
| outputFormat | string | Non | - | Format de sortie : `png`, `webp` ou `avif` |
| edgeRefine | integer | Non | - | Niveau d'affinage des contours (0-3) |
| decontaminate | boolean | Non | - | Supprimer les débordements de couleur sur les bords |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
```

## Réponse {#response}

### Réponse initiale (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progression (SSE à `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Point de terminaison des effets (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Réapplique les effets d'arrière-plan sans réexécuter le modèle IA. Utilise le masque mis en cache et l'original de la phase 1.

### Paramètres {#parameters-1}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| settings | JSON | Oui | - | JSON contenant les réglages des effets (voir ci-dessous) |
| backgroundImage | file | Non | - | Image d'arrière-plan personnalisée (lorsque backgroundType est `image`) |

#### Champs du JSON settings {#settings-json-fields}

| Champ | Type | Requis | Description |
|-------|------|----------|-------------|
| jobId | string | Oui | ID de tâche issu de la phase 1 |
| filename | string | Oui | Nom de fichier d'origine issu de la phase 1 |
| backgroundType | string | Non | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Non | Couleur hexadécimale pour un arrière-plan uni |
| gradientColor1 | string | Non | Première couleur du dégradé |
| gradientColor2 | string | Non | Deuxième couleur du dégradé |
| gradientAngle | number | Non | Angle du dégradé en degrés |
| blurEnabled | boolean | Non | Activer le flou d'arrière-plan |
| blurIntensity | number | Non | Intensité du flou (0-100) |
| shadowEnabled | boolean | Non | Activer l'ombre portée |
| shadowOpacity | number | Non | Opacité de l'ombre (0-100) |
| outputFormat | string | Non | `png`, `webp` ou `avif` |

### Exemple de requête {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Réponse (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Remarques {#notes}

- Nécessite l'installation de l'ensemble de modèles `background-removal` (4-5 Go).
- La phase 1 met en cache le masque transparent et l'image d'origine afin que la phase 2 (effets) puisse réappliquer instantanément différents arrière-plans sans réexécuter le modèle IA.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
- La rotation EXIF est corrigée automatiquement avant le traitement.
