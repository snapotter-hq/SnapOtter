---
description: "Ajuste la luminosité, le contraste, la saturation, la température, la teinte, les canaux et applique des effets de couleur."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: ef7ea26bbba7
---

# Ajuster les couleurs {#adjust-colors}

Outil complet d'ajustement des couleurs combinant luminosité, contraste, exposition, saturation, température, tonalité, rotation de teinte, niveaux par canal et effets en un clic (niveaux de gris, sépia, inversion) dans un seul point de terminaison.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Accepte des données de formulaire multipart contenant un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| brightness | nombre | Non | `0` | Ajustement de la luminosité (-100 à 100) |
| contrast | nombre | Non | `0` | Ajustement du contraste (-100 à 100) |
| exposure | nombre | Non | `0` | Exposition / gamma des tons moyens (-100 à 100) |
| saturation | nombre | Non | `0` | Saturation des couleurs (-100 à 100) |
| temperature | nombre | Non | `0` | Balance des blancs : froid/bleu à chaud/orange (-100 à 100) |
| tint | nombre | Non | `0` | Décalage de tonalité : vert à magenta (-100 à 100) |
| hue | nombre | Non | `0` | Rotation de teinte en degrés (-180 à 180) |
| sharpness | nombre | Non | `0` | Force de la netteté (0 à 100) |
| red | nombre | Non | `100` | Niveau du canal rouge (0 à 200, 100 = inchangé) |
| green | nombre | Non | `100` | Niveau du canal vert (0 à 200, 100 = inchangé) |
| blue | nombre | Non | `100` | Niveau du canal bleu (0 à 200, 100 = inchangé) |
| effect | chaîne | Non | `"none"` | Effet de couleur : `none`, `grayscale`, `sepia`, `invert` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Appliquer un rendu vintage chaleureux :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Remarques {#notes}

- Tous les paramètres ont pour valeur par défaut des valeurs neutres, de sorte que vous n'ajustez que ce dont vous avez besoin.
- Les ajustements sont appliqués dans cet ordre : luminosité, contraste, exposition, saturation/teinte, température/tonalité, netteté, canaux, effets.
- La température utilise une matrice de recombinaison des couleurs 3x3 sur les axes bleu-orange et vert-magenta.
- L'exposition correspond à la fonction gamma de Sharp (une valeur positive éclaircit les tons moyens, une valeur négative les assombrit).
- Ce point de terminaison répond également aux anciens chemins `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` et `/api/v1/tools/image/color-effects`. Tous utilisent le même schéma.
- Le format de sortie correspond au format d'entrée. Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
