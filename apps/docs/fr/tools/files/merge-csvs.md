---
description: "Combine plusieurs fichiers CSV ou TSV aux colonnes identiques en un seul."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 6daf28bf50d5
---

# Fusionner des CSV {#merge-csvs}

Combine plusieurs fichiers CSV ou TSV aux colonnes identiques en un seul fichier fusionné. Tous les fichiers d'entrée doivent avoir les mêmes en-têtes de colonnes.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Accepte des données de formulaire multipart contenant deux fichiers CSV ou plus. Aucun champ de paramètres n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez 2 à 20 fichiers CSV ou TSV ayant les mêmes en-têtes de colonnes.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Remarques {#notes}

- Nécessite entre 2 et 20 fichiers d'entrée.
- Tous les fichiers doivent partager les mêmes en-têtes de colonnes. La fusion échoue si les colonnes ne correspondent pas.
- La ligne d'en-tête est incluse une seule fois dans la sortie ; les lignes de données de tous les fichiers sont concaténées dans l'ordre de téléversement.
- Les fichiers CSV et TSV sont tous deux acceptés, mais tous les fichiers d'une même requête doivent utiliser le même délimiteur.
