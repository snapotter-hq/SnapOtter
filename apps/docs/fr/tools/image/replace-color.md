---
description: "Remplacez une couleur spécifique d'une image par une autre couleur ou rendez-la transparente."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: f50180e18e82
---

# Remplacer et inverser la couleur {#replace-invert-color}

Remplacez les pixels correspondant à une couleur source par une couleur cible, ou rendez-les transparents. Utilise la distance euclidienne dans l'espace RGB avec une tolérance configurable pour un fondu progressif aux frontières de couleur.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Non | `"#FF0000"` | Couleur hexadécimale à rechercher (format : `#RRGGBB`) |
| targetColor | string | Non | `"#00FF00"` | Couleur hexadécimale de remplacement (format : `#RRGGBB`) |
| makeTransparent | boolean | Non | `false` | Rendre les pixels correspondants transparents au lieu de les remplacer par la couleur cible |
| tolerance | number | Non | `30` | Tolérance de correspondance des couleurs (0 à 255). Des valeurs plus élevées font correspondre une gamme plus large de couleurs similaires |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Rendre un arrière-plan vert transparent :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Remarques {#notes}

- La correspondance des couleurs utilise la distance euclidienne dans l'espace RGB, mise à l'échelle par `tolerance * sqrt(3)`.
- Le fondu du remplacement est proportionnel à la distance de couleur : les pixels plus proches de la couleur source reçoivent davantage de la couleur cible, ce qui crée des transitions progressives.
- Lorsque `makeTransparent` vaut `true`, la sortie est forcée en PNG (ou WebP/AVIF) si le format d'entrée ne prend pas en charge les canaux alpha (par exemple JPEG).
- Une tolérance de 0 ne fait correspondre que la couleur source exacte. Des valeurs plus élevées (50+) feront correspondre une gamme plus large de teintes similaires.
- Le format de sortie correspond au format d'entrée, sauf si la transparence est nécessaire et que le format d'entrée ne prend pas en charge le canal alpha.
