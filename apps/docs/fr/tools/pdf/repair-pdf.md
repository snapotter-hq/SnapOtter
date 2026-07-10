---
description: "Tenter de réparer un PDF endommagé ou corrompu."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: f27bf08f0819
---

# Réparer un PDF {#repair-pdf}

Tentez de réparer un PDF endommagé ou corrompu en reconstruisant sa structure interne.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Accepte des données de formulaire multipart avec un fichier PDF. Aucun champ `settings` n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre de réglage. Téléversez directement le fichier PDF endommagé.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Remarques {#notes}

- La validation structurelle est ignorée à l'entrée pour laisser passer les fichiers mal formés.
- La réparation est effectuée au mieux ; les fichiers gravement corrompus peuvent ne pas être entièrement récupérables.
- Le PDF réparé peut différer légèrement en taille de l'original en raison des tables de références croisées reconstruites.
