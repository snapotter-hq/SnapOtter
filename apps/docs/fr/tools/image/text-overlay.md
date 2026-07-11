---
description: "Ajoute des superpositions de texte stylisées avec ombres portées et boîtes d'arrière-plan."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: fee7b26f2182
---

# Superposition de texte {#text-overlay}

Ajoute du texte stylisé aux images avec une ombre portée facultative et une boîte d'arrière-plan semi-transparente. Adapté aux titres, légendes ou annotations sur les photos.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| text | string | Oui | - | Texte à superposer (1 à 500 caractères) |
| fontSize | number | Non | `48` | Taille de police en pixels (8 à 200) |
| color | string | Non | `"#FFFFFF"` | Couleur du texte au format hexadécimal (`#RRGGBB`) |
| position | string | Non | `"bottom"` | Placement vertical : `top`, `center`, `bottom` |
| backgroundBox | boolean | Non | `false` | Affiche un rectangle d'arrière-plan semi-transparent derrière le texte |
| backgroundColor | string | Non | `"#000000"` | Couleur de la boîte d'arrière-plan au format hexadécimal (`#RRGGBB`) |
| shadow | boolean | Non | `true` | Applique une ombre portée derrière le texte |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Avec une boîte d'arrière-plan :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Remarques {#notes}

- Le texte est toujours centré horizontalement dans l'image.
- L'ombre portée utilise un décalage de 2 px avec un flou de 3 px à 70 % d'opacité noire.
- La boîte d'arrière-plan occupe toute la largeur de l'image à 70 % d'opacité, avec une hauteur proportionnelle à la taille de police (1,8x).
- Le texte est rendu via une composition SVG, la police sans empattement par défaut du système est donc utilisée.
- Les caractères spéciaux XML dans le texte sont échappés de manière sûre.
- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
