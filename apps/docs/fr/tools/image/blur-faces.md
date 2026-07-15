---
description: "Détecte et floute automatiquement les visages dans les images grâce à la détection de visages par IA, pour la confidentialité et une anonymisation conforme au RGPD."
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: db97c8556891
---

# Flouter les visages et données sensibles {#face-pii-blur}

Détecte et floute automatiquement les visages dans les images grâce à la détection de visages assistée par IA (MediaPipe).

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Traitement :** asynchrone (renvoie 202, interrogez `/api/v1/jobs/{jobId}/progress` pour connaître le statut via SSE)

**Bundle de modèles :** `face-detection` (200 à 300 Mo)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| file | fichier | Oui | - | Fichier image (multipart) |
| blurRadius | nombre | Non | `30` | Rayon de flou appliqué aux visages détectés (1 à 100) |
| sensitivity | nombre | Non | `0.5` | Sensibilité de la détection de visages (0 à 1). Des valeurs plus faibles détectent moins de visages avec une confiance plus élevée |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
```

## Réponse {#response}

### Réponse initiale (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progression (SSE sur `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Aucun visage détecté {#no-faces-detected}

Si aucun visage n'est trouvé, le résultat inclut un avertissement :

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Remarques {#notes}

- Nécessite l'installation du bundle de modèles `face-detection` (200 à 300 Mo).
- Le format de sortie correspond automatiquement au format d'entrée.
- Le tableau `faces` contient les coordonnées du cadre de délimitation (x, y, largeur, hauteur) de chaque visage détecté.
- Augmentez `sensitivity` (proche de 1.0) pour détecter davantage de visages, y compris ceux partiellement masqués.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
