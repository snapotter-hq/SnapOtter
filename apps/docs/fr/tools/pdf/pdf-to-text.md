---
description: "Extraire le texte brut d'un PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 6420be9c79b2
---

# PDF vers texte {#pdf-to-text}

Extrayez tout le texte brut lisible d'un document PDF dans un fichier texte.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Accepte des données de formulaire multipart avec un fichier PDF.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez un PDF et son contenu texte sera extrait.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Remarques {#notes}

- Format d'entrée accepté : `.pdf`.
- Il s'agit d'un outil rapide (synchrone) qui renvoie le résultat directement.
- Le champ `chars` de la réponse indique le nombre de caractères extraits.
- Seul le texte intégré numériquement est extrait. Pour les documents numérisés ou les PDF basés sur des images, utilisez plutôt l'outil [OCR de PDF](./ocr-pdf).
