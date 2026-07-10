---
description: "Extrait en toute sécurité les fichiers d'une archive ZIP avec protection contre les bombes."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: c16425228cdd
---

# Extraire un ZIP {#extract-zip}

Extrait en toute sécurité les fichiers d'une archive ZIP. Les archives à fichier unique renvoient directement le fichier contenu ; les archives à plusieurs fichiers renvoient un ZIP à plat avec le contenu extrait.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Accepte des données de formulaire multipart avec un fichier ZIP. Aucun champ de réglages n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Chargez un fichier `.zip` à extraire.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Remarques {#notes}

- Seuls les fichiers `.zip` sont acceptés en entrée.
- Si l'archive contient un seul fichier, ce fichier est renvoyé directement (et non enveloppé dans un ZIP).
- Si l'archive contient plusieurs fichiers, un ZIP à plat est renvoyé avec tous les fichiers extraits à la racine (la structure de répertoires imbriqués est aplatie).
- Une protection intégrée contre les bombes rejette les archives présentant des taux de compression ou des nombres de fichiers excessifs afin d'éviter l'épuisement des ressources.
