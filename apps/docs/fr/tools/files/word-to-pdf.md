---
description: "Convertit des documents Word en PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 911e578a57de
---

# Word vers PDF {#word-to-pdf}

Convertit des documents Word, du texte OpenDocument, du RTF ou des fichiers texte brut en PDF.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Accepte des données de formulaire multipart contenant un fichier Word/ODT/RTF/TXT.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez un document et il sera converti en PDF.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Formats d'entrée acceptés : `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- La conversion est prise en charge par LibreOffice exécuté en mode headless sur le serveur.
- Les polices intégrées au document sont utilisées lorsqu'elles sont disponibles ; sinon, des polices système sont substituées.
- Les en-têtes, pieds de page, tableaux et images sont préservés dans le PDF de sortie.
