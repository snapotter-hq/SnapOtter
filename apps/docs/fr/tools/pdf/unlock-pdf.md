---
description: "Supprimer la protection par mot de passe d'un PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 2d6702e0a6b5
---

# Déverrouiller un PDF {#unlock-pdf}

Supprimez la protection par mot de passe d'un PDF chiffré en fournissant le mot de passe correct.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| password | string | Oui | - | Mot de passe pour déchiffrer le PDF (1-256 caractères) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Remarques {#notes}

- Le mot de passe correct doit être fourni ; un mot de passe incorrect renvoie une erreur 400.
- Le mot de passe utilisateur ou le mot de passe propriétaire fonctionnera pour le déchiffrement.
- Les mots de passe sont masqués dans les journaux d'audit.
