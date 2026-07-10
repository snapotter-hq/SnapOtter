---
description: "Remplace l'arrière-plan d'une image par une couleur unie ou un dégradé grâce à l'IA."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: bebdb66a0221
---

# Remplacer l'arrière-plan {#background-replace}

Remplace l'arrière-plan d'une image par une couleur unie ou un dégradé. Le modèle d'IA détecte le sujet, supprime l'arrière-plan d'origine et compose le sujet sur l'arrière-plan de votre choix.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Accepte des données de formulaire multipart contenant un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | chaîne | Non | `"color"` | Mode d'arrière-plan : `color` ou `gradient` |
| color | chaîne | Non | `"#ffffff"` | Couleur hex de l'arrière-plan (lorsque backgroundType vaut `color`) |
| gradientColor1 | chaîne | Non | - | Première couleur hex du dégradé |
| gradientColor2 | chaîne | Non | - | Deuxième couleur hex du dégradé |
| gradientAngle | entier | Non | `180` | Angle du dégradé en degrés (0 à 360) |
| feather | entier | Non | `0` | Rayon d'adoucissement des bords (0 à 20) |
| format | chaîne | Non | `"png"` | Format de sortie : `png` ou `webp` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Suivez la progression via SSE sur `GET /api/v1/jobs/{jobId}/progress`. Une fois le travail terminé, le flux SSE émet un événement `completed` contenant l'URL de téléchargement.

## Remarques {#notes}

- Il s'agit d'un outil assisté par IA qui renvoie `202 Accepted` et traite de façon asynchrone. Connectez-vous au point de terminaison SSE pour recevoir les mises à jour de progression et le résultat final.
- Nécessite l'installation du bundle de fonctionnalités **background-removal**. Renvoie `501` si le bundle n'est pas disponible.
- Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
- La sortie est par défaut au format PNG afin de préserver la transparence autour du sujet.
