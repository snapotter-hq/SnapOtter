---
description: "Disposer plusieurs pages PDF par feuille (2-up, 4-up, etc.)."
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: 4f094c78685e
---

# PDF N-up {#n-up-pdf}

Disposez plusieurs pages par feuille pour économiser du papier à l'impression, comme les mises en page 2-up ou 4-up.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Non | `2` | Pages par feuille : `2`, `3`, `4`, `8`, `9`, `12`, ou `16` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Remarques {#notes}

- Les pages sont disposées dans l'ordre de lecture (de gauche à droite, de haut en bas).
- La taille de la page de sortie correspond à celle de l'original ; les pages individuelles sont réduites pour tenir dans la grille.
- Un document de 20 pages avec `perSheet: 4` produit une sortie de 5 pages.
