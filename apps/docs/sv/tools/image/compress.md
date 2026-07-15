---
description: "Minska bildfilstorleken efter kvalitetsnivå eller till en målfilstorlek."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: 3eccb093997f
---

# Komprimera bild {#compress}

Minska bildfilstorleken genom att ange en kvalitetsnivå eller en målfilstorlek i kilobyte. Verktyget använder iterativ binärsökning för att träffa storleksmål exakt.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/compress`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| mode | string | Nej | `"quality"` | Komprimeringsläge: `quality` eller `targetSize` |
| quality | number | Nej | `80` | Kvalitetsnivå (1-100). Används när läget är `quality`. |
| targetSizeKb | number | Nej | - | Målfilstorlek i kilobyte. Används när läget är `targetSize`. |

## Exempelbegäran {#example-request}

Komprimera till kvalitet 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Komprimera till målstorlek 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Anteckningar {#notes}

- I läget `quality` ger lägre värden mindre filer med fler komprimeringsartefakter. Värdet 80 är ett bra standardval för webbanvändning.
- I läget `targetSize` utför motorn iterativ komprimering för att komma så nära målet som möjligt utan att överskrida det.
- Utdataformatet matchar indataformatet. Komprimeringen tillämpas på formatets inbyggda kodning (t.ex. JPEG-kvalitet för JPEG-filer, WebP-kvalitet för WebP-filer).
- Om standardkvaliteten (80) är godtagbar kan du utelämna parametern `quality` helt.
