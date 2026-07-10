---
description: "Extrait les éléments répétés d'un XML vers un tableau CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 9fe368beb623
---

# XML vers CSV {#xml-to-csv}

Extrait les éléments répétés d'un fichier XML vers un tableau CSV plat. L'outil trouve automatiquement le premier tableau d'objets dans l'arbre XML et associe chaque élément à une ligne.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Accepte des données de formulaire multipart contenant un fichier XML. Aucun champ de paramètres n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. L'élément répété est détecté automatiquement à partir de la structure XML.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Remarques {#notes}

- Seuls les fichiers `.xml` sont acceptés en entrée.
- L'outil parcourt l'arbre XML à la recherche du premier ensemble répété d'éléments frères et les utilise comme lignes.
- Chaque nom d'élément enfant ou d'attribut unique devient un en-tête de colonne CSV.
- Il s'agit d'une conversion à sens unique. Pour une conversion JSON/XML bidirectionnelle, utilisez l'outil [JSON vers XML](/fr/tools/files/json-xml).
