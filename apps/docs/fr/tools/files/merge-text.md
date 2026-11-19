---
description: "Combinez plusieurs fichiers texte ou Markdown en un seul, dans l'ordre de votre choix."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: d9570ff6c11f
i18n_hash_version: 2
---

# Fusionner des fichiers texte {#merge-text}

Combinez plusieurs fichiers texte ou Markdown en un seul fichier. Les fichiers sont joints dans l'ordre de téléversement : réorganisez-les dans la liste avant de lancer l'opération si l'ordre compte.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Accepte des données de formulaire multipart avec au moins deux fichiers texte et une chaîne JSON `settings` facultative.

## Paramètres {#parameters}

| Paramètre | Type | Défaut | Description |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Ce qui sépare les fichiers : `"blank-line"`, `"rule"` (une ligne `---`) ou `"filename-heading"` (le nom de chaque fichier comme titre) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Remarques {#notes}

- Accepte les fichiers `.txt`, `.md`, `.markdown`, `.csv` et `.log`, entre 2 et 50 par requête.
- Chaque fichier doit être du texte UTF-8. Un fichier binaire ou non UTF-8 est rejeté, et son nom figure dans l'erreur.
- Quand toutes les entrées ont la même extension, la sortie la conserve (`merged.md`, `merged.log`). Des entrées mixtes produisent `merged.txt`.
- Avec `filename-heading`, la sortie Markdown utilise des titres `# name.md` ; la sortie en texte brut utilise des lignes de repère `==> name.txt <==`.
- Les lignes vides de fin sont supprimées de chaque fichier pour que le séparateur se place proprement entre les documents. Une marque d'ordre des octets initiale est ignorée.
- Les fichiers CSV sont joints comme du texte brut. Utilisez [Fusionner des CSV](./merge-csvs) pour combiner des tableaux avec une seule ligne d'en-tête.
- Les fichiers d'e-mail `.eml` ne sont pas encore pris en charge.
