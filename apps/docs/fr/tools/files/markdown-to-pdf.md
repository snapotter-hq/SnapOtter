---
description: "Convertit un fichier Markdown en PDF mis en forme."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 2c55755e6870
---

# Markdown vers PDF {#markdown-to-pdf}

Convertit un fichier Markdown en document PDF mis en forme. Les ressources distantes sont désactivées pour préserver la confidentialité.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Accepte des données de formulaire multipart contenant un fichier Markdown.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez un fichier Markdown et il sera converti en PDF.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
```

## Exemple de réponse {#example-response}

Renvoie `202 Accepted`. Suivez la progression via SSE sur `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Remarques {#notes}

- Formats d'entrée acceptés : `.md`, `.markdown`.
- Les ressources distantes (images, feuilles de style référencées par URL) ne sont pas récupérées, pour des raisons de confidentialité et de sécurité.
- Le Markdown est d'abord rendu en HTML, puis converti en PDF via WeasyPrint.
- Les blocs de code, les tableaux et les autres éléments Markdown sont mis en forme dans le PDF de sortie.
