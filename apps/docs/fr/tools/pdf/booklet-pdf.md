---
description: "Réorganise les pages d'un PDF pour les plier en livret."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 73fe7122c427
---

# PDF en livret {#booklet-pdf}

Impose les pages pour une impression recto verso afin que les feuilles imprimées puissent être pliées en livret.

## Point d'accès de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Non | `2` | Pages par feuille : `2`, `4`, `6` ou `8` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Remarques {#notes}

- La valeur par défaut `perSheet: 2` place deux pages côte à côte sur chaque feuille, ce qui correspond à la disposition standard de livret pour l'impression recto verso.
- Des pages blanches sont ajoutées automatiquement si le nombre total de pages n'est pas un multiple de la taille de la feuille.
- Imprimez la sortie en recto verso avec une reliure sur bord court, puis pliez et agrafez.
