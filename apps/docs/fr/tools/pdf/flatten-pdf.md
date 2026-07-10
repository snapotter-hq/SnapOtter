---
description: "Intégrer les formulaires et annotations dans le contenu des pages."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 52e3912267a3
---

# Aplatir un PDF {#flatten-pdf}

Intégrez les champs de formulaire interactifs et les annotations dans le contenu des pages, produisant un PDF statique qui s'affiche de la même façon partout.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Accepte des données de formulaire multipart avec un fichier PDF.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez un PDF et tous les formulaires et annotations seront aplatis.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Remarques {#notes}

- Format d'entrée accepté : `.pdf`.
- Il s'agit d'un outil rapide (synchrone) qui renvoie le résultat directement.
- Les valeurs des champs de formulaire sont conservées sous forme de texte statique dans la sortie.
- Les annotations (commentaires, surlignages, notes autocollantes) deviennent partie intégrante du contenu de la page et ne peuvent plus être modifiées.
