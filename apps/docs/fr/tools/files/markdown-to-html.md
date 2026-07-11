---
description: "Convertit un fichier Markdown en une page HTML autonome."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: ff851dcc58e0
---

# Markdown vers HTML {#markdown-to-html}

Convertit un fichier Markdown en une page HTML autonome. Les images distantes référencées dans la source sont laissées telles quelles dans la sortie.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Accepte des données de formulaire multipart avec un fichier Markdown.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Chargez un fichier Markdown et il sera converti en HTML.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Remarques {#notes}

- Formats d'entrée acceptés : `.md`, `.markdown`.
- C'est un outil rapide (synchrone) qui renvoie le résultat directement.
- La sortie est une page HTML autonome avec des styles en ligne.
- Les URL d'images distantes dans la source Markdown sont conservées telles quelles et ne sont pas récupérées.
