---
description: "Suppression de l'arrière-plan assistée par IA avec effets optionnels (flou, ombre, dégradé, arrière-plan personnalisé)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 421c7413ba36
---

# Supprimer l'arrière-plan {#remove-background}

Suppression de l'arrière-plan assistée par IA avec effets optionnels (flou, ombre, dégradé, arrière-plan personnalisé).

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour connaître l'état via SSE)

**Ensemble de modèles :** `background-removal` (4-5 Go)

## Paramètres {#parameters}

La phase 1 supprime l'arrière-plan et met en cache le masque PNG transparent ainsi que l'image d'origine. Le remplacement d'arrière-plan, le flou, l'ombre portée et la conversion du format de sortie sont appliqués en [phase 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (ou lorsque `remove-background` s'exécute comme étape de pipeline ou tâche par lots) ; transmettre ces champs à la phase 1 renvoie 400.

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| model | string | Non | - | Variante de modèle IA à utiliser |
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
| backgroundImage | file | Requis lorsque `backgroundType` vaut `image` | - | Image d'arrière-plan personnalisée (lorsque backgroundType est `image`) |

#### Champs du JSON settings {#settings-json-fields}

| Champ | Type | Requis | Défaut | Description |
|-------|------|----------|---------|-------------|
| jobId | string | Oui | - | ID de tâche issu de la phase 1 |
| filename | string | Oui | - | Nom de fichier d'origine issu de la phase 1 |
| backgroundType | string | Non | `"transparent"` | L'un de : `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Requis lorsque `backgroundType` vaut `color` | - | Couleur hexadécimale : `#RRGGBB` ou `#RGB` (le `#` est facultatif) |
| gradientColor1 | string | Requis lorsque `backgroundType` vaut `gradient` | - | Première couleur du dégradé, hexadécimale comme `backgroundColor` |
| gradientColor2 | string | Requis lorsque `backgroundType` vaut `gradient` | - | Deuxième couleur du dégradé, hexadécimale comme `backgroundColor` |
| gradientAngle | number | Non | - | Angle du dégradé en degrés |
| blurEnabled | boolean | Non | - | Flouter l'arrière-plan d'origine derrière le sujet (`backgroundType: "blur"` l'implique) |
| blurIntensity | number | Non | - | Intensité du flou (0-100) |
| shadowEnabled | boolean | Non | - | Activer l'ombre portée sur le sujet |
| shadowOpacity | number | Non | `35` | Opacité de l'ombre (0-100), utilisée lorsque `shadowEnabled` est vrai |
| outputFormat | string | Non | `"png"` | Format de sortie : `png`, `webp` ou `avif` |

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

#### Erreur : suppression d'arrière-plan expirée (410) {#error-background-removal-expired-410}

Le point de terminaison des effets s'appuie sur le masque et l'original que la phase 1 a stockés pour `jobId`. Les sorties stockées sont nettoyées au bout d'un moment ; si trop de temps s'écoule entre les deux appels, elles ont disparu. Relancez la phase 1 avec la même image et utilisez le `jobId` qu'elle renvoie.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

Un `jobId` ou `filename` qui ne peut pas désigner un fichier stocké (un séparateur de chemin, `..`, une chaîne vide) renvoie 400.

## Remarques {#notes}

- Nécessite l'installation de l'ensemble de modèles `background-removal` (4-5 Go).
- La phase 1 met en cache le masque transparent et l'image d'origine afin que la phase 2 (effets) puisse réappliquer instantanément différents arrière-plans sans réexécuter le modèle IA.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
- La rotation EXIF est corrigée automatiquement avant le traitement.
