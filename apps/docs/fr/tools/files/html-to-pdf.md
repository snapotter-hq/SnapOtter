---
description: "Convertit un fichier HTML en PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 47fbe044ba88
---

# HTML vers PDF {#html-to-pdf}

Convertit un fichier HTML en un document PDF mis en forme. Les ressources distantes (images externes, feuilles de style, scripts) sont désactivées pour préserver la confidentialité.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Accepte des données de formulaire multipart avec un fichier HTML.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Chargez un fichier HTML et il sera converti en PDF.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- Formats d'entrée acceptés : `.html`, `.htm`.
- Les ressources distantes (images, feuilles de style, scripts référencés via des URL) ne sont pas récupérées pour des raisons de confidentialité et de sécurité.
- Les styles en ligne et les images intégrées (data URI) sont conservés.
- La conversion est effectuée par WeasyPrint sur le serveur.
