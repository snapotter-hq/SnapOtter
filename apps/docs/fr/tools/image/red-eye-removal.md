---
description: "Détection et correction assistées par IA des yeux rouges causés par le flash de l'appareil photo."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: cea6069635e3
---

# Suppression des yeux rouges {#red-eye-removal}

Détection et correction assistées par IA des yeux rouges causés par le flash de l'appareil photo.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour connaître l'état via SSE)

**Ensemble de modèles :** `face-detection` (200-300 Mo)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| sensitivity | number | Non | `50` | Sensibilité de détection des yeux rouges (0-100). Des valeurs plus élevées détectent des yeux rouges plus subtils |
| strength | number | Non | `70` | Intensité de la correction (0-100). Degré d'agressivité de la neutralisation du rouge |
| format | string | Non | - | Format de sortie (remplacement facultatif) |
| quality | number | Non | `90` | Qualité de sortie (1-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Remarques {#notes}

- Nécessite l'installation de l'ensemble de modèles `face-detection` (200-300 Mo).
- Détecte d'abord les visages, puis localise les zones oculaires dans chaque visage, et enfin identifie et corrige les pixels affectés par les yeux rouges.
- Le nombre `facesDetected` indique combien de visages ont été trouvés ; `eyesCorrected` est le nombre total d'yeux individuels dont les yeux rouges ont été corrigés.
- La sortie est toujours en PNG pour une préservation maximale de la qualité.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
