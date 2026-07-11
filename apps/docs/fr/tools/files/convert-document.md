---
description: "Convertit entre les formats Word, OpenDocument, RTF et texte brut."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 37d5884d6c87
---

# Convertir un document {#convert-document}

Convertit des documents entre les formats Word (DOCX), OpenDocument (ODT), RTF et texte brut à l'aide de LibreOffice.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Accepte des données de formulaire multipart avec un fichier Word/ODT/RTF/TXT et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Oui | - | Format de sortie : `docx`, `odt`, `rtf`, `txt` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- Formats d'entrée acceptés : `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- La conversion est effectuée par LibreOffice exécuté en mode headless sur le serveur.
- La mise en forme complexe (macros, objets intégrés) peut ne pas survivre à la conversion entre formats.
- Le format de sortie doit être différent du format d'entrée.
