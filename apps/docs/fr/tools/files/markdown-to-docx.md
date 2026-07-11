---
description: "Convertit un fichier Markdown en document Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 93afb01d2191
---

# Markdown vers Word {#markdown-to-word}

Convertit un fichier Markdown en document Word (DOCX), en conservant les titres, les listes, les blocs de code et les autres éléments de mise en forme.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Accepte des données de formulaire multipart avec un fichier Markdown.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Chargez un fichier Markdown et il sera converti en DOCX.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Remarques {#notes}

- Formats d'entrée acceptés : `.md`, `.markdown`.
- C'est un outil rapide (synchrone) qui renvoie le résultat directement.
- Les titres, le gras, l'italique, les liens, les blocs de code et les listes sont mappés vers les styles Word.
- La conversion est effectuée par Pandoc sur le serveur.
