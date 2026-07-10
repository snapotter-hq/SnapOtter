---
description: "Convertit des présentations en PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: c236ef164143
---

# PowerPoint vers PDF {#powerpoint-to-pdf}

Convertit des présentations PowerPoint ou OpenDocument en PDF, avec une diapositive par page.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Accepte des données de formulaire multipart contenant un fichier PowerPoint/ODP.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez une présentation et elle sera convertie en PDF.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
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

- Formats d'entrée acceptés : `.pptx`, `.ppt`, `.odp`.
- Chaque diapositive devient une page du PDF.
- La conversion est prise en charge par LibreOffice exécuté en mode headless sur le serveur.
- Les animations et les transitions ne sont pas incluses dans le PDF de sortie.
