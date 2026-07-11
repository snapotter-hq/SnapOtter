---
description: "Regroupe plusieurs fichiers dans une seule archive ZIP."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: eb644dc4819e
---

# Créer un ZIP {#create-zip}

Regroupe plusieurs fichiers de tout type dans une seule archive ZIP. Les noms de fichiers en double sont automatiquement dédupliqués.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Accepte des données de formulaire multipart avec deux fichiers ou plus. Aucun champ de réglages n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Chargez entre 2 et 50 fichiers de tout type à regrouper.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Remarques {#notes}

- Nécessite entre 2 et 50 fichiers d'entrée.
- Tout type de fichier est accepté ; il n'y a aucune restriction sur le format d'entrée.
- Si plusieurs fichiers portent le même nom, ils sont automatiquement dédupliqués avec des suffixes numériques.
- L'archive de sortie utilise la compression ZIP standard (deflate).
