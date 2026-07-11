---
description: "Recadrage intelligent tenant compte du sujet, des visages et de l'entropie, qui cadre les images de manière pertinente grâce à Sharp et à la détection de visages par IA."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 89915ca6b9a5
---

# Recadrage intelligent {#smart-crop}

Recadrage intelligent basé sur le sujet, les visages ou le rognage. Utilise les stratégies d'attention/entropie de Sharp et la détection de visages par IA pour un cadrage pertinent.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Traitement :** asynchrone (renvoie 202, interroger `/api/v1/jobs/{jobId}/progress` pour le statut via SSE)

**Bundle de modèle :** `face-detection` (200-300 Mo) - requis uniquement pour le mode `face`

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| mode | string | Non | `"subject"` | Mode de recadrage : `subject`, `face`, `trim`. (Les valeurs héritées `attention` et `content` correspondent à `subject` et `trim`) |
| strategy | string | Non | `"attention"` | Stratégie pour le mode sujet : `attention` ou `entropy` |
| width | integer | Non | - | Largeur cible en pixels |
| height | integer | Non | - | Hauteur cible en pixels |
| padding | integer | Non | `0` | Pourcentage de marge autour du sujet (0-50) |
| facePreset | string | Non | `"head-shoulders"` | Préréglage de cadrage du visage : `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Non | `0.5` | Sensibilité de la détection de visages (0-1) |
| threshold | integer | Non | `30` | Seuil du mode rognage pour la détection de l'arrière-plan (0-255) |
| padToSquare | boolean | Non | `false` | Compléter le résultat rogné pour obtenir un carré |
| padColor | string | Non | `"#ffffff"` | Couleur d'arrière-plan pour le remplissage |
| targetSize | integer | Non | - | Taille cible pour la sortie remplie (pixels) |
| quality | integer | Non | - | Qualité de sortie (1-100) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modes {#modes}

### Mode sujet {#subject-mode}
Utilise la stratégie d'attention ou d'entropie de Sharp pour trouver la région visuellement la plus intéressante et recadre autour d'elle.

### Mode visage {#face-mode}
Détecte les visages à l'aide de l'IA, puis cadre le recadrage autour des visages détectés selon le `facePreset` spécifié. Revient au mode sujet (stratégie d'attention) si aucun visage n'est détecté.

### Mode rognage {#trim-mode}
Supprime les bordures ou l'arrière-plan uniformes de l'image. Complète éventuellement le résultat pour obtenir un carré avec une couleur d'arrière-plan et une taille cible spécifiées.

## Remarques {#notes}

- Cet outil utilise la fabrique `createToolRoute` avec `executionHint: "long"`, il renvoie donc 202 avec une progression via SSE.
- Le mode visage nécessite le bundle de modèle `face-detection` (200-300 Mo).
- Les modes sujet et rognage fonctionnent sans aucun bundle de modèle IA.
- Le `facePreset` détermine à quel point le recadrage cadre étroitement les visages détectés : `closeup` est le plus serré, `half-body` le plus large.
- Si aucune largeur ni hauteur n'est spécifiée, la valeur par défaut est 1080x1080.
