---
description: "Accentue la netteté des images avec des méthodes adaptative, masque flou ou passe-haut, avec réduction du bruit facultative."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: a502bbfe8589
---

# Renforcement de la netteté {#sharpening}

Outil avancé de renforcement de la netteté offrant trois méthodes : adaptative (intelligente et sensible aux contours), masque flou (rayon/quantité classiques) et passe-haut (accentuation des textures). Comprend une réduction du bruit intégrée pour éviter les artefacts de netteté.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| method | string | Non | `"adaptive"` | Algorithme de netteté : `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | Non | `1.0` | Adaptative : sigma gaussien (0,5 à 10) |
| m1 | number | Non | `1.0` | Adaptative : netteté des zones planes (0 à 10) |
| m2 | number | Non | `3.0` | Adaptative : netteté des zones dentelées (0 à 20) |
| x1 | number | Non | `2.0` | Adaptative : seuil plane/dentelée (0 à 10) |
| y2 | number | Non | `12` | Adaptative : netteté maximale des zones planes (0 à 50) |
| y3 | number | Non | `20` | Adaptative : netteté maximale des zones dentelées (0 à 50) |
| amount | number | Non | `100` | Masque flou : quantité de netteté (0 à 1000) |
| radius | number | Non | `1.0` | Masque flou : rayon de flou en pixels (0,1 à 5) |
| threshold | number | Non | `0` | Masque flou : différence de luminosité minimale à accentuer (0 à 255) |
| strength | number | Non | `50` | Passe-haut : force du filtre (0 à 100) |
| kernelSize | number | Non | `3` | Passe-haut : taille du noyau de convolution (3 ou 5) |
| denoise | string | Non | `"off"` | Réduction du bruit avant renforcement : `off`, `light`, `medium`, `strong` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Masque flou avec seuil pour protéger les zones lisses :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Remarques {#notes}

- Seuls les paramètres pertinents pour la méthode choisie sont utilisés. Par exemple, `amount`, `radius` et `threshold` sont ignorés lorsque `method` vaut `adaptive`.
- La méthode adaptative utilise le renforcement adaptatif intégré de Sharp, avec un comportement configurable pour les régions planes/dentelées.
- L'option `denoise` applique une réduction du bruit avant le renforcement afin d'éviter l'amplification du bruit ou du grain.
- Le renforcement passe-haut extrait les détails fins en soustrayant une version floutée de l'original, puis en la fusionnant à nouveau.
- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
