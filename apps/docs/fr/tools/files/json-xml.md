---
description: "Convertit entre JSON et XML, dans les deux sens."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 557e796d4a1b
---

# JSON vers XML {#json-to-xml}

Convertit entre les formats JSON et XML dans les deux sens. Chargez un fichier JSON pour obtenir du XML, ou chargez un fichier XML pour obtenir du JSON.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Accepte des données de formulaire multipart avec un fichier JSON ou XML et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Non | `true` | Met en forme la sortie avec indentation |

## Exemple de requête {#example-request}

JSON vers XML :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML vers JSON :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Remarques {#notes}

- Le sens de conversion est détecté automatiquement à partir de l'extension du fichier d'entrée : `.json` produit `.xml`, et `.xml` produit `.json`.
- Le paramètre `pretty` s'applique dans les deux sens. Lorsqu'il vaut `false`, la sortie est compacte sans indentation.
- Les attributs XML et les structures imbriquées sont conservés lors de la conversion aller-retour lorsque cela est possible.
