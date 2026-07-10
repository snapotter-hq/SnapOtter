---
description: "Convertit des fichiers Word, Markdown, HTML ou texte brut en EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 188bb143bd5c
---

# Convertir en EPUB {#convert-to-epub}

Convertit des documents Word, du Markdown, du HTML ou des fichiers texte brut au format de livre numérique EPUB.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Accepte des données de formulaire multipart contenant un fichier Word/Markdown/HTML/TXT.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez un document et il sera converti en EPUB.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- Formats d'entrée acceptés : `.docx`, `.md`, `.html`, `.txt`.
- La sortie EPUB respecte la spécification EPUB 3.
- Les titres du document source servent à générer la table des matières.
- La conversion est prise en charge par Pandoc sur le serveur.
