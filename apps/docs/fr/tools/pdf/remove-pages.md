---
description: "Supprimer des pages spécifiques d'un PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: dd7ef2cd7ee1
---

# Supprimer des pages {#remove-pages}

Supprimez des pages spécifiques d'un PDF en conservant toutes les pages restantes intactes.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Oui | - | Plage de pages à supprimer en syntaxe qpdf, par exemple `"3,5-7"` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Remarques {#notes}

- Vous ne pouvez pas supprimer toutes les pages d'un document ; au moins une page doit rester.
- Les plages de pages utilisent la syntaxe qpdf : `3` pour une page unique, `5-7` pour une plage, et des virgules pour combiner (par exemple `1,3,5-7`).
