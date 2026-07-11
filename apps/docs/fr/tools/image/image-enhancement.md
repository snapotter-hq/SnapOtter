---
description: "Amélioration automatique en un clic qui analyse une image et corrige l'exposition, le contraste, la balance des blancs, la saturation et la netteté."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 491122cef23a
---

# Amélioration d'image {#image-enhancement}

Amélioration automatique en un clic avec analyse intelligente. Analyse l'image et applique des corrections d'exposition, de contraste, de balance des blancs, de saturation, de netteté et de débruitage.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Traitement :** Synchrone (utilise la factory `createToolRoute`, renvoie le résultat directement)

**Ensemble de modèles :** Aucun requis pour l'amélioration de base. L'ensemble `upscale-enhance` (5 à 6 Go) n'est utilisé que lorsque `deepEnhance` est activé (pour la suppression de bruit par IA via SCUNet).

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| mode | string | Non | `"auto"` | Mode d'amélioration : `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Non | `50` | Intensité globale de l'amélioration (0-100) |
| corrections | object | Non | toutes `true` | Corrections sélectives à appliquer (voir ci-dessous) |
| deepEnhance | boolean | Non | `false` | Activer la suppression de bruit par IA (nécessite l'outil `noise-removal` installé) |

### Objet Corrections {#corrections-object}

| Champ | Type | Par défaut | Description |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Corriger automatiquement l'exposition |
| contrast | boolean | `true` | Corriger automatiquement le contraste |
| whiteBalance | boolean | `true` | Corriger automatiquement la balance des blancs |
| saturation | boolean | `true` | Corriger automatiquement la saturation |
| sharpness | boolean | `true` | Renforcer automatiquement la netteté |
| denoise | boolean | `true` | Débruitage léger |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Réponse (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Point de terminaison Analyze {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Analyse une image et renvoie des recommandations de correction sans les appliquer.

### Paramètres {#parameters-1}

| Paramètre | Type | Requis | Description |
|-----------|------|----------|-------------|
| file | file | Oui | Fichier image (multipart) |

### Exemple de requête {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Réponse (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Notes {#notes}

- Cet outil utilise la factory synchrone `createToolRoute`, il renvoie donc une réponse standard (pas de 202 asynchrone).
- Le paramètre `mode` ajuste la pondération des corrections (par exemple, le mode portrait est plus doux sur les tons chair, le mode paysage renforce la saturation).
- Lorsque `deepEnhance` est activé et que l'outil `noise-removal` (SCUNet) est installé, une passe de débruitage par IA supplémentaire est appliquée après les corrections standard.
- Le point de terminaison Analyze est utile pour prévisualiser les corrections qui seraient appliquées avant de valider.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
