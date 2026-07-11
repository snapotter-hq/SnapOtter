---
description: "Lire et écrire les métadonnées d'un document PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 13f782479ba2
---

# Métadonnées PDF {#pdf-metadata}

Lisez et mettez à jour les champs de métadonnées d'un document PDF tels que le titre, l'auteur, le sujet et les mots-clés. Lorsqu'aucun réglage n'est fourni, les métadonnées existantes sont renvoyées sans modification.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` facultatif au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| title | string | Non | - | Titre du document (500 caractères max.) |
| author | string | Non | - | Auteur du document (500 caractères max.) |
| subject | string | Non | - | Sujet du document (500 caractères max.) |
| keywords | string | Non | - | Mots-clés du document (500 caractères max.) |

Tous les paramètres sont facultatifs. Les champs omis restent inchangés.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Remarques {#notes}

- Format d'entrée accepté : `.pdf`.
- Il s'agit d'un outil rapide (synchrone) qui renvoie le résultat directement.
- Le champ `metadata` de la réponse contient les métadonnées résultantes après toute mise à jour.
- Pour lire les métadonnées sans les modifier, omettez le champ `settings` ou envoyez un objet vide.
- Chaque champ de métadonnées est limité à 500 caractères.
