---
description: "Läs och skriv metadata för PDF-dokument."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: c159b5211bfd
---

# PDF Metadata {#pdf-metadata}

Läs och uppdatera metadatafält för PDF-dokument, såsom titel, författare, ämne och nyckelord. När inga inställningar anges returneras befintlig metadata utan ändring.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Tar emot multipart-formulärdata med en PDF-fil och ett valfritt JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| title | string | Nej | - | Dokumenttitel (max 500 tecken) |
| author | string | Nej | - | Dokumentförfattare (max 500 tecken) |
| subject | string | Nej | - | Dokumentämne (max 500 tecken) |
| keywords | string | Nej | - | Dokumentnyckelord (max 500 tecken) |

Alla parametrar är valfria. Utelämnade fält lämnas oförändrade.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Godkänt indataformat: `.pdf`.
- Detta är ett snabbt (synkront) verktyg som returnerar resultatet direkt.
- Fältet `metadata` i svaret innehåller den resulterande metadatan efter eventuella uppdateringar.
- För att läsa metadata utan att ändra den, utelämna fältet `settings` eller skicka ett tomt objekt.
- Varje metadatafält är begränsat till 500 tecken.
