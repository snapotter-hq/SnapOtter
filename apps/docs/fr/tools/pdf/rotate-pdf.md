---
description: "Faire pivoter les pages d'un PDF de 90, 180 ou 270 degrés."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: d9d6423b1e2f
---

# Faire pivoter un PDF {#rotate-pdf}

Faites pivoter toutes les pages ou des pages sélectionnées d'un PDF d'un angle spécifié.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | Non | `90` | Angle de rotation : `90`, `180`, ou `270` |
| range | string | Non | `"1-z"` | Plage de pages en syntaxe qpdf, par exemple `"1-5,8"` (`"1-z"` = toutes les pages) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Remarques {#notes}

- La rotation se fait dans le sens des aiguilles d'une montre.
- Les plages de pages utilisent la syntaxe qpdf : `1-5` pour les pages 1 à 5, `z` pour la dernière page, et des virgules pour combiner des plages.
- La plage par défaut `"1-z"` fait pivoter toutes les pages.
