---
description: "Kombinera flera PDF-filer till ett enda dokument."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: e1166877da2f
---

# Merge PDFs {#merge-pdfs}

Kombinera två eller fler PDF-filer till ett enda dokument och bevara sidordningen i varje indatafil.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Tar emot multipart-formulärdata med två eller fler PDF-filer. Inget fält `settings` krävs.

## Parameters {#parameters}

Detta verktyg har inga inställningsparametrar. Ladda helt enkelt upp två eller fler PDF-filer.

| Begränsning | Värde |
|------------|-------|
| Minsta antal filer | 2 |
| Högsta antal filer | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Filerna slås samman i den ordning de laddas upp.
- Minst två PDF-filer krävs; begäran misslyckas med ett 400-fel om färre anges.
- Det högsta antalet indatafiler är 20.
- Krypterade PDF-filer måste låsas upp innan de slås samman.
