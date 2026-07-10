---
description: "Extraire des pages ou diviser un PDF en plusieurs parties."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: b6b3e592a9c3
---

# Diviser un PDF {#split-pdf}

Extrayez une plage de pages vers un nouveau PDF, ou divisez un document en blocs de N pages.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Non | `"range"` | Mode de division : `range` ou `every` |
| range | string | Lorsque le mode est `range` | - | Plage de pages en syntaxe qpdf, par exemple `"1-5,8,10-z"` |
| everyN | integer | Lorsque le mode est `every` | - | Diviser en blocs de N pages (1-500) |

## Exemple de requête {#example-request}

Extraire des pages spécifiques :

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Diviser en blocs de 10 pages :

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Remarques {#notes}

- En mode `range`, un seul PDF contenant les pages sélectionnées est renvoyé.
- En mode `every`, le résultat est une archive ZIP contenant les parties individuelles.
- Les plages de pages utilisent la syntaxe qpdf : `1-5` pour les pages 1 à 5, `z` pour la dernière page, et des virgules pour combiner des plages (par exemple `1-3,7,10-z`).
