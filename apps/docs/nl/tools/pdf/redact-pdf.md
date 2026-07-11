---
description: "Verwijder tekstvoorkomens permanent uit een PDF (geverifieerde echte redactie)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 361b7eb14f09
---

# Redact PDF {#redact-pdf}

Verwijder opgegeven tekstvoorkomens permanent uit een PDF met geverifieerde echte redactie. De geredigeerde tekst wordt volledig uit het bestand verwijderd, niet alleen afgedekt met een zwart vlak.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| terms | string[] | Ja | - | Te redigeren tekststrings (1-50 termen, elk tot 200 tekens) |
| caseSensitive | boolean | Nee | `false` | Of matching hoofdlettergevoelig is |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Geaccepteerd invoerformaat: `.pdf`.
- Dit is een snel (synchroon) hulpmiddel dat het resultaat direct teruggeeft.
- Dit voert echte redactie uit: overeenkomende tekst wordt uit de PDF-inhoudsstroom verwijderd, niet alleen visueel verhuld.
- Het veld `found` in het antwoord geeft aan hoeveel voorkomens zijn geredigeerd.
- Je kunt tot 50 termen in één verzoek redigeren.
