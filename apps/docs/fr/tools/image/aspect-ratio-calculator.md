---
description: "Calcule la largeur ou la hauteur manquante qui conserve un format d'image, et simplifie le rapport."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 3691c270a4c8
i18n_hash_version: 2
---

# Calculateur de format d'image {#aspect-ratio-calculator}

Saisissez une largeur et une hauteur d'origine, puis une nouvelle largeur ou une nouvelle hauteur, et l'outil renvoie l'autre côté pour que les proportions restent identiques. Le rapport est renvoyé sous sa forme la plus simple : 1920 × 1080 donne 16:9. Dans l'application web, vous pouvez partir d'un format courant (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) et basculer entre paysage et portrait.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Accepte un corps JSON, et non des données de formulaire multipart, et répond avec des nombres plutôt qu'avec un fichier à télécharger.

## Paramètres {#parameters}

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `width` | nombre | (requis) | Largeur d'origine. |
| `height` | nombre | (requis) | Hauteur d'origine. |
| `newWidth` | nombre | - | Largeur cible. La réponse en déduit `newHeight`. |
| `newHeight` | nombre | - | Hauteur cible. La réponse en déduit `newWidth`. |
| `round` | booléen | `true` | Arrondit le côté calculé à un nombre entier. Lorsque la valeur est `false`, il conserve deux décimales. |

Chaque dimension doit être comprise entre `0.0001` et `1000000`. Envoyez `newWidth` ou `newHeight`, pas les deux. Omettez les deux pour obtenir uniquement le rapport simplifié.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Exemple de réponse {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` et `newHeight` valent `null` lorsque la requête n'a envoyé ni l'un ni l'autre.

## Remarques {#notes}

- Les tailles fractionnaires sont ramenées à un rapport d'entiers avec jusqu'à quatre décimales, donc `8.5` × `11` est renvoyé sous la forme `17:22`.
- `ratioDecimal` est la largeur divisée par la hauteur, arrondie à quatre décimales.
- Un côté calculé n'est jamais renvoyé sous la forme `0`. Avec l'arrondi, il vaut au moins `1`, et sans arrondi, au moins `0.01`.
- L'envoi simultané de `newWidth` et `newHeight`, ou d'une dimension hors de la plage autorisée, renvoie une erreur 400.
- Le calculateur ne lit ni n'écrit jamais de fichier. Pour appliquer les nombres, utilisez [Redimensionner une image](/fr/tools/image/resize) ou [Recadrer une image](/fr/tools/image/crop).
