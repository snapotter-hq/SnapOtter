---
description: "Réorganiser, faire pivoter, supprimer et récupérer des pages d'autres PDF dans un éditeur ou via l'API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 2c7140174228
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Assembler un PDF à partir d'un plan de pages explicite : réorganiser, dupliquer, faire pivoter ou supprimer des pages, et récupérer des pages d'autres PDF, le tout en une seule requête.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Accepte des données de formulaire multipart avec un ou plusieurs fichiers PDF et un champ JSON `settings`.
Jusqu'à 20 documents d'entrée et 1 200 pages de sortie sont pris en charge par requête.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Description |
|-----------|------|----------|-------------|
| items | array | Oui | Plan de pages de sortie, dans l'ordre de sortie. Chaque élément est `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indexe les fichiers téléversés dans l'ordre de téléversement (base 0) ; `page` est un numéro de page base 1 dans ce document. |
| pageCounts | array | Oui | Nombre réel de pages de chaque document téléversé, dans le même ordre. Une page du plan au-delà du nombre de pages de son document est rejetée avec une erreur 400. |

## Exemple de requête {#example-request}

Prendre les pages 3 et 1 du premier document, puis les pages 1 et 2 du second, en faisant pivoter la première page de sortie de 90° dans le sens horaire :

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- La même page peut apparaître plusieurs fois dans `items` pour la dupliquer.
- Les pages absentes de `items` sont omises de la sortie.
- `rot` enregistre la nouvelle orientation d'affichage sur la page copiée (composée avec toute rotation existante) ; le contenu de la page n'est pas modifié.
- La rotation est appliquée par copie de sortie, de sorte que les doublons peuvent avoir des rotations différentes.
- La sortie est un document nouveau et plat ; les signets source et les métadonnées au niveau du document ne sont pas conservés.
- Le traitement nécessite le binaire qpdf, fourni dans l'image Docker officielle.
