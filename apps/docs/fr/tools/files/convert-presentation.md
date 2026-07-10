---
description: "Convertit entre les formats de présentation PowerPoint et OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: e41400cd701d
---

# Convertir une présentation {#convert-presentation}

Convertit des présentations entre les formats PowerPoint (PPTX) et OpenDocument Presentation (ODP).

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Accepte des données de formulaire multipart avec un fichier PowerPoint/ODP et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Oui | - | Format de sortie : `pptx`, `odp` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
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

- Formats d'entrée acceptés : `.pptx`, `.ppt`, `.odp`.
- La conversion est effectuée par LibreOffice exécuté en mode headless sur le serveur.
- Les animations et les effets de transition peuvent ne pas être conservés d'un format à l'autre.
- Le format de sortie doit être différent du format d'entrée.
