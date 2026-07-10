---
description: "Extraire des pages sélectionnées d'un PDF vers un nouveau document."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 2d4f7d483f7e
---

# Extraire des pages {#extract-pages}

Extrayez des pages sélectionnées d'un PDF vers un nouveau document plus petit.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| range | string | Oui | - | Plage de pages en syntaxe qpdf, par exemple `"1-5,8,10-z"` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Remarques {#notes}

- Les plages de pages utilisent la syntaxe qpdf : `1-5` pour les pages 1 à 5, `z` pour la dernière page, et des virgules pour combiner des plages (par exemple `1-3,7,10-z`).
- Les pages extraites conservent leur mise en forme, leurs annotations et leurs liens d'origine.
