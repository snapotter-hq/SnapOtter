---
description: "Crée des graphiques en barres, en courbes ou en camembert à partir de données CSV ou JSON."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: 2f40ee78e330
---

# Créateur de graphiques {#chart-maker}

Crée des graphiques en barres, en courbes ou en camembert à partir de données CSV ou JSON. Renvoie une image PNG du graphique rendu.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Accepte des données de formulaire multipart avec un fichier CSV ou JSON et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| kind | string | Non | `"bar"` | Type de graphique : `bar`, `line`, `pie` |
| title | string | Non | - | Titre du graphique (120 caractères max.) |
| width | integer | Non | `960` | Largeur du graphique en pixels (320-2048) |
| height | integer | Non | `540` | Hauteur du graphique en pixels (240-1536) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Remarques {#notes}

- L'entrée doit être un fichier `.csv` ou `.json`. Les fichiers CSV doivent comporter une ligne d'en-tête avec les noms des colonnes.
- La première colonne sert d'étiquette de catégorie ; la deuxième colonne doit être numérique et fournit les valeurs des données. Seules deux colonnes sont utilisées.
- L'entrée JSON doit être un tableau d'objets `{label, value}`, ou un objet simple dont les clés deviennent des étiquettes et les valeurs des points de données.
- Maximum de 100 points de données. Toutes les valeurs doivent être supérieures ou égales à zéro.
- La sortie est toujours une image PNG, quel que soit le format d'entrée.
