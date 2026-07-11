---
description: "Combineer meerdere PDF's tot één document."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: 948726ac482d
---

# Merge PDFs {#merge-pdfs}

Combineer twee of meer PDF-bestanden tot één document, met behoud van de paginavolgorde van elk invoerbestand.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Accepteert multipart-formuliergegevens met twee of meer PDF-bestanden. Er is geen veld `settings` vereist.

## Parameters {#parameters}

Dit hulpmiddel heeft geen instellingsparameters. Upload gewoon twee of meer PDF-bestanden.

| Beperking | Waarde |
|------------|-------|
| Minimum aantal bestanden | 2 |
| Maximum aantal bestanden | 20 |

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

- Bestanden worden samengevoegd in de volgorde waarin ze worden geüpload.
- Er zijn minstens twee PDF-bestanden vereist; het verzoek mislukt met een 400-fout als er minder worden aangeleverd.
- Het maximale aantal invoerbestanden is 20.
- Versleutelde PDF's moeten worden ontgrendeld voordat ze worden samengevoegd.
