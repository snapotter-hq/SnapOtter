---
description: "Résout la règle de trois et trouve X à partir de trois valeurs connues."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 6e1f9eab6993
i18n_hash_version: 2
---

# Calculateur de proportions {#proportion-calculator}

Résout la règle de trois (produit en croix). Saisissez trois valeurs, choisissez directe ou inverse, et obtenez la quatrième. Les valeurs restent dans le formulaire après chaque réponse : vous pouvez changer un nombre et appuyer sur Entrée pour essayer le calcul suivant.

Il s'agit du solveur de proportions mathématique, pas de la grille des tiers pour la composition photo.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Accepte un corps JSON, et non des données de formulaire multipart, et répond avec un nombre plutôt qu'avec un fichier à télécharger.

## Paramètres {#parameters}

| Nom | Type | Par défaut | Description |
|------|------|---------|-------------|
| `a` | number | (requis) | Première valeur connue. |
| `b` | number | (requis) | La valeur qui va avec `a`. |
| `c` | number | (requis) | Troisième valeur connue. X est la valeur qui va avec elle. |
| `mode` | string | `direct` | `direct` ou `inverse`. |

| Mode | Se lit | Formule | Exemple |
|------|----------|---------|---------|
| `direct` | A est à B ce que C est à X | X = B × C ÷ A | 3 pommes coûtent 6, donc 10 pommes coûtent 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 ouvriers mettent 6 jours, donc 8 ouvriers mettent 3 jours |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Exemple de réponse {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Remarques {#notes}

- La réponse est arrondie à 15 chiffres significatifs, donc `0.1 × 3 ÷ 3` revient sous la forme `0.1` plutôt que `0.10000000000000002`.
- `a` ne peut pas valoir `0` dans une proportion directe, ni `c` valoir `0` dans une proportion inverse, car chacun sert de diviseur. Dans les deux cas, la réponse est une erreur 400.
- Une réponse hors de la plage qu'un double peut représenter (au-dessus d'environ `1.8e308`, ou trop proche de zéro pour garder sa précision) renvoie une erreur 400.
- Dans l'application web, vous pouvez saisir `1,5` ou `1.5`, et les chiffres arabo-indiens ou devanagari fonctionnent aussi. Les séparateurs de milliers ne sont pas acceptés.
