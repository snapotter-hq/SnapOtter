---
description: "Convertit entre CSV et JSON, dans les deux sens."
i18n_source_hash: 5b24abf5e9d2
i18n_provenance: human
i18n_output_hash: d1257aab2118
---

# CSV vers JSON {#csv-to-json}

Convertit entre les formats CSV et JSON dans les deux sens. Chargez un fichier CSV ou TSV pour obtenir un tableau JSON d'objets, ou chargez du JSON (un tableau d'objets, ou un objet qui en contient un) pour obtenir un fichier CSV.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Accepte des données de formulaire multipart avec un fichier CSV, TSV ou JSON et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Non | `true` | Met en forme la sortie JSON avec indentation |

## Exemple de requête {#example-request}

CSV vers JSON :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON vers CSV :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Remarques {#notes}

- Le sens de conversion est détecté automatiquement à partir de l'extension du fichier d'entrée : `.csv` ou `.tsv` produit `.json`, et `.json` produit `.csv`.
- Le paramètre `pretty` n'affecte que la sortie JSON. Lorsqu'il est défini sur `false`, la sortie est une chaîne JSON compacte sur une seule ligne.
- L'entrée JSON peut être un tableau d'objets, un objet à clé unique contenant un tel tableau (comme `{"data": [...]}`) ou un objet plat de valeurs scalaires. Chaque objet devient une ligne, et chaque clé devient un en-tête de colonne. Un objet plat donne un tableau à deux colonnes `key,value`. Les objets à plusieurs clés de premier niveau et les tableaux vides sont rejetés.
- Les fichiers TSV (valeurs séparées par des tabulations) sont pris en charge au même titre que le CSV.
