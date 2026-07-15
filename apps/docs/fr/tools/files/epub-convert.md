---
description: "Convertit un EPUB en PDF, DOCX, HTML ou Markdown."
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: 2c403470bb3d
---

# Convertir depuis EPUB {#convert-epub}

Convertit un livre électronique EPUB en PDF, Word (DOCX), HTML ou Markdown. Les ressources distantes contenues dans le livre ne sont pas récupérées.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Accepte des données de formulaire multipart avec un fichier EPUB et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Oui | - | Format de sortie : `pdf`, `docx`, `html`, `md` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- Format d'entrée accepté : `.epub`.
- Les ressources distantes intégrées dans l'EPUB (images externes, polices) ne sont pas récupérées pour des raisons de sécurité.
- La fidélité des images dans la sortie convertie peut varier selon la structure de l'EPUB.
- La conversion est effectuée par Pandoc sur le serveur.
