---
description: "Convertit entre les formats Excel, OpenDocument et CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 19b28617bab8
---

# Convertir une feuille de calcul {#convert-spreadsheet}

Convertit des feuilles de calcul entre les formats Excel (XLSX), OpenDocument Spreadsheet (ODS) et CSV. Les classeurs à plusieurs feuilles exportent la première feuille lors de la conversion en CSV.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Accepte des données de formulaire multipart avec un fichier Excel/ODS/CSV et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Oui | - | Format de sortie : `xlsx`, `ods`, `csv` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Exemple de réponse {#example-response}

Renvoie `202 Accepted`. Suivez la progression via SSE à `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Remarques {#notes}

- Formats d'entrée acceptés : `.xlsx`, `.xls`, `.ods`, `.csv`.
- Lors de la conversion d'un classeur à plusieurs feuilles en CSV, seule la première feuille est exportée.
- Les formules sont évaluées et exportées sous forme de valeurs statiques dans la sortie CSV.
- Le format de sortie doit être différent du format d'entrée.
