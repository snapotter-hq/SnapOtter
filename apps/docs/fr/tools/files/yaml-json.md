---
description: "Convertit entre YAML et JSON, dans les deux sens."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: b8a94654ee90
---

# Convertir YAML / JSON {#yaml-json}

Convertit entre les formats YAML et JSON dans les deux sens. Téléversez un fichier YAML pour obtenir du JSON, ou téléversez un fichier JSON pour obtenir du YAML.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Accepte des données de formulaire multipart contenant un fichier YAML ou JSON. Aucun champ de paramètres n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Le sens de la conversion est déterminé par l'extension du fichier d'entrée.

## Exemple de requête {#example-request}

YAML vers JSON :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON vers YAML :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Remarques {#notes}

- Le sens de la conversion est détecté automatiquement à partir de l'extension du fichier d'entrée : `.yaml` ou `.yml` produit `.json`, et `.json` produit `.yaml`.
- Les extensions `.yaml` et `.yml` sont toutes deux acceptées.
- Seul le premier document d'un fichier YAML multi-documents est converti ; les documents supplémentaires séparés par `---` sont ignorés.
