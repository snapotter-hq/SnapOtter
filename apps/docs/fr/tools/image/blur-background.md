---
description: "Floute l'arrière-plan tout en gardant le sujet net grâce à l'IA."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 042227e69a5b
---

# Flouter l'arrière-plan {#blur-background}

Floute l'arrière-plan d'une image tout en gardant le sujet net. Le modèle d'IA isole le sujet, applique un flou à l'arrière-plan d'origine et compose le sujet net par-dessus.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Accepte des données de formulaire multipart contenant un fichier image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| intensity | entier | Non | `50` | Intensité du flou (1 à 100) |
| feather | entier | Non | `0` | Rayon d'adoucissement des bords (0 à 20) |
| format | chaîne | Non | `"png"` | Format de sortie : `png` ou `webp` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
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
- Des valeurs d'intensité plus élevées produisent un effet de flou plus prononcé. Les valeurs supérieures à 80 créent une séparation prononcée de type bokeh.
- Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
