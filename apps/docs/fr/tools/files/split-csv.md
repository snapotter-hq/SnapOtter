---
description: "Découpe un CSV en fichiers plus petits selon le nombre de lignes."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: b5942d5159af
---

# Découper un CSV {#split-csv}

Découpe un gros fichier CSV ou TSV en fichiers plus petits selon le nombre de lignes. Renvoie une archive ZIP contenant les parties.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Accepte des données de formulaire multipart contenant un fichier CSV et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | entier | Non | `1000` | Nombre de lignes de données par fichier de sortie (1 à 1 000 000) |
| keepHeader | booléen | Non | `true` | Répète la ligne d'en-tête dans chaque fichier de sortie |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Remarques {#notes}

- La sortie est toujours une archive ZIP contenant les parties du CSV découpé, nommées séquentiellement (par exemple `part-1.csv`, `part-2.csv`).
- Lorsque `keepHeader` vaut `true`, chaque partie inclut la ligne d'en-tête d'origine, de sorte que chaque fichier peut être utilisé indépendamment.
- Les fichiers CSV et TSV sont tous deux acceptés en entrée.
- Le nombre de lignes fait uniquement référence aux lignes de données ; la ligne d'en-tête n'est pas comptabilisée.
