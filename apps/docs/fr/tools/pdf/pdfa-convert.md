---
description: "Convertir un PDF au format d'archivage PDF/A-2 pour une conservation à long terme."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: a18ec51a3d2c
---

# Conversion PDF/A {#pdf-a-convert}

Convertissez un PDF au format d'archivage PDF/A-2, adapté à la conservation à long terme et à la conformité réglementaire.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Accepte des données de formulaire multipart avec un fichier PDF. Aucun champ `settings` n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre de réglage. Téléversez directement le fichier PDF.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Remarques {#notes}

- La sortie est conforme à la norme PDF/A-2.
- Le format PDF/A intègre toutes les polices et interdit les références externes, de sorte que le fichier de sortie peut être plus volumineux que l'original.
- Le chiffrement et le JavaScript sont supprimés lors de la conversion, car ils ne sont pas autorisés par la norme PDF/A.
