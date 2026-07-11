---
description: "Corrige les faux PNG transparents grâce au détourage par IA (BiRefNet) pour produire une véritable transparence alpha, avec un nettoyage des contours par défrangeage."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: a679aa24c8dd
---

# Correcteur de transparence PNG {#png-transparency-fixer}

Corrige les faux PNG transparents en un clic. Utilise le détourage par IA (modèle BiRefNet HR Matting) pour produire une véritable transparence alpha, avec un post-traitement de défrangeage pour nettoyer les contours.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Traitement :** asynchrone (renvoie 202, interroger `/api/v1/jobs/{jobId}/progress` pour le statut via SSE)

**Bundle de modèle :** `background-removal` (4-5 Go)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| defringe | number | Non | `30` | Intensité du défrangeage (0-100). Supprime les pixels de frange semi-transparents autour des contours |
| outputFormat | string | Non | `"png"` | Format de sortie : `png` ou `webp` |
| removeWatermark | boolean | Non | `false` | Applique un prétraitement de suppression de filigrane (filtre médian) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Résultat final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Remarques {#notes}

- Nécessite l'installation du bundle de modèle `background-removal` (4-5 Go).
- Utilise `birefnet-hr-matting` comme modèle principal pour un détourage alpha de haute qualité. Revient à `birefnet-general` si le modèle HR manque de mémoire.
- L'option `defringe` supprime les pixels de frange semi-transparents que le détourage par IA laisse parfois autour des cheveux, de la fourrure et des contours fins. Elle fonctionne en floutant le canal alpha et en mettant à zéro les pixels de faible confiance.
- L'option `removeWatermark` applique une étape de prétraitement par filtre médian. Il s'agit d'une réduction de filigrane basique, et non d'un outil dédié à la suppression de filigrane.
- Ne produit que du PNG ou du WebP sans perte (tous deux prennent en charge la transparence alpha).
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
