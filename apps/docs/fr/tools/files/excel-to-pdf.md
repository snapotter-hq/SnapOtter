---
description: "Convertit des feuilles de calcul en PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 91307fe17421
---

# Excel vers PDF {#excel-to-pdf}

Convertit des feuilles de calcul Excel, OpenDocument ou CSV en PDF. Les feuilles larges peuvent être paginées sur plusieurs pages.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Accepte des données de formulaire multipart avec un fichier Excel/ODS/CSV.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Chargez une feuille de calcul et elle sera convertie en PDF.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- Les feuilles larges peuvent être réparties sur plusieurs pages dans le PDF résultant.
- Les graphiques et la mise en forme conditionnelle sont rendus dans la sortie PDF.
- La conversion est effectuée par LibreOffice exécuté en mode headless sur le serveur.
