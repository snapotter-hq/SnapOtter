---
description: "Rogner toutes les pages d'un PDF avec une marge uniforme."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 541553bea606
---

# Rogner un PDF {#crop-pdf}

Rognez toutes les pages d'un PDF en appliquant une marge uniforme, en supprimant le contenu de chaque bord de manière égale.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| margin | number | Non | `20` | Marge de rognage uniforme en points (0-2000) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Remarques {#notes}

- La valeur de la marge est exprimée en points PDF (1 point = 1/72 pouce).
- La même marge est appliquée aux quatre bords de chaque page.
- Une marge de `0` supprime toutes les marges de rognage existantes, affichant l'intégralité de la boîte média.
