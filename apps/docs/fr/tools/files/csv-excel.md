---
description: "Convertit entre CSV et Excel (XLSX), dans les deux sens."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 34ca3514ed7d
---

# CSV vers Excel {#csv-to-excel}

Convertit entre les formats CSV et Excel (XLSX) dans les deux sens. Chargez un fichier CSV ou TSV pour obtenir un XLSX, ou chargez un fichier XLSX pour obtenir un CSV.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Accepte des données de formulaire multipart avec un fichier CSV, TSV ou XLSX et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | Non | `1` | Numéro de la feuille de calcul à exporter lors de la conversion depuis XLSX (min. 1) |

## Exemple de requête {#example-request}

CSV vers Excel :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel vers CSV :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Remarques {#notes}

- Le sens de conversion est détecté automatiquement à partir de l'extension du fichier d'entrée : `.csv` ou `.tsv` produit `.xlsx`, et `.xlsx` produit `.csv`.
- Le paramètre `sheet` ne s'applique que lors de la conversion depuis XLSX. Il sélectionne la feuille de calcul à exporter.
- Les fichiers TSV (valeurs séparées par des tabulations) sont pris en charge au même titre que le CSV.
