---
description: "Ajouter une protection par mot de passe avec chiffrement AES-256 à un PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: afb16e6dbc20
---

# Protéger un PDF {#protect-pdf}

Ajoutez une protection par mot de passe à un PDF à l'aide du chiffrement AES-256.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Oui | - | Mot de passe requis pour ouvrir le PDF (1-256 caractères) |
| ownerPassword | string | Non | Identique à `userPassword` | Mot de passe propriétaire pour les autorisations (1-256 caractères) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Remarques {#notes}

- Le chiffrement utilise AES-256.
- Si `ownerPassword` est omis, il prend par défaut la même valeur que `userPassword`.
- Les mots de passe sont masqués dans les journaux d'audit.
- Le PDF chiffré nécessite le mot de passe utilisateur pour être ouvert et le mot de passe propriétaire (s'il est différent) pour les autorisations complètes.
