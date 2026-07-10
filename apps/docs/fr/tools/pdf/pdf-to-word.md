---
description: "Convertir un PDF en document Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: aae48465ba37
---

# PDF vers Word {#pdf-to-word}

Convertissez un PDF basé sur du texte en document Word (DOCX). Idéal pour les PDF avec du texte sélectionnable ; les pages numérisées nécessiteront d'abord une OCR.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Accepte des données de formulaire multipart avec un fichier PDF.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Téléversez un PDF et il sera converti en DOCX.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Exemple de réponse {#example-response}

Renvoie `202 Accepted`. Suivez la progression via SSE à `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Remarques {#notes}

- Format d'entrée accepté : `.pdf`.
- Fonctionne mieux avec des PDF basés sur du texte. Les pages numérisées ou uniquement en images produiront une sortie vide ou minimale ; utilisez [OCR de PDF](./ocr-pdf) pour ajouter d'abord une couche de texte.
- La conversion est effectuée par LibreOffice s'exécutant en mode headless sur le serveur.
- Les mises en page complexes (multi-colonnes, éléments superposés) peuvent ne pas se convertir parfaitement.
