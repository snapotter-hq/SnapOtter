---
description: "Convertir toutes les couleurs d'un PDF en niveaux de gris."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 769e588e51e6
---

# PDF en niveaux de gris {#grayscale-pdf}

Convertissez toutes les couleurs d'un PDF en niveaux de gris, produisant une version en noir et blanc du document.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Accepte des données de formulaire multipart avec un fichier PDF. Aucun champ `settings` n'est requis.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre de réglage. Téléversez directement le fichier PDF.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Remarques {#notes}

- Tous les espaces colorimétriques (RGB, CMYK) sont convertis en niveaux de gris, y compris les images intégrées, les graphiques vectoriels et le texte.
- Le fichier de sortie est souvent plus petit que l'original, car les données en niveaux de gris nécessitent moins d'octets par pixel.
