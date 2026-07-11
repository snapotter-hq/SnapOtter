---
description: "Réorganiser les pages d'un PDF selon un ordre de pages explicite."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 78062d1a0bc6
---

# Organiser un PDF {#organize-pdf}

Réorganisez les pages d'un PDF en spécifiant la séquence de pages souhaitée.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| order | string | Oui | - | Ordre de pages souhaité en syntaxe qpdf, par exemple `"3,1,2,5-z"` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Remarques {#notes}

- Les plages de pages utilisent la syntaxe qpdf : `3,1,2` réorganise les trois premières pages, et `5-z` ajoute les pages 5 à la dernière page.
- Les pages peuvent être dupliquées en les listant plusieurs fois (par exemple `"1,1,2,3"` duplique la page 1).
- Les pages non listées dans la chaîne d'ordre sont omises de la sortie.
