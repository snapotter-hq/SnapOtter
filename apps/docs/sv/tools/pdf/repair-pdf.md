---
description: "Försök reparera en skadad eller korrupt PDF."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 6c2f016abc0a
---

# Repair PDF {#repair-pdf}

Försök reparera en skadad eller korrupt PDF genom att rekonstruera dess interna struktur.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Tar emot multipart-formulärdata med en PDF-fil. Inget fält `settings` krävs.

## Parameters {#parameters}

Detta verktyg har inga inställningsparametrar. Ladda upp den skadade PDF-filen direkt.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Strukturell validering hoppas över på indata för att släppa igenom felaktigt utformade filer.
- Reparation är bästa möjliga försök; allvarligt korrupta filer kanske inte kan återställas helt.
- Den reparerade PDF-filen kan skilja sig något i storlek från originalet på grund av rekonstruerade korsreferenstabeller.
