---
description: "Combiner plusieurs PDF en un seul document."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: c599ce7c8acb
---

# Fusionner des PDF {#merge-pdfs}

Combinez deux fichiers PDF ou plus en un seul document, en préservant l'ordre des pages de chaque fichier d'entrée.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Accepte des données de formulaire multipart avec deux fichiers PDF ou plus. Aucun champ `settings` n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre de réglage. Il suffit de téléverser deux fichiers PDF ou plus.

| Contrainte | Valeur |
|------------|-------|
| Nombre minimal de fichiers | 2 |
| Nombre maximal de fichiers | 20 |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Remarques {#notes}

- Les fichiers sont fusionnés dans l'ordre où ils sont téléversés.
- Au moins deux fichiers PDF sont requis ; la requête échoue avec une erreur 400 si moins sont fournis.
- Le nombre maximal de fichiers d'entrée est de 20.
- Les PDF chiffrés doivent être déverrouillés avant la fusion.
