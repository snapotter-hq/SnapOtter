---
description: "Läs och skriv metadata för PDF-dokument."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: f8b43193b722
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

Läs och uppdatera metadatafält för PDF-dokument, såsom titel, författare, ämne och nyckelord, eller ta bort dokumentets metadata helt. När inga inställningar anges returneras befintlig metadata utan ändring.

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
| stripAll | boolean | Nej | false | Ta bort hela Info-dictionaryn (datum, Creator, Producer, egna nycklar), alla XMP-strömmar (dokument, sidor, bilder) och all PieceInfo-applikationsdata, och skriv sedan eventuella fält som anges ovan |
| removeAttachments | boolean | Nej | false | Ta även bort inbäddade filer: dokumentets bilagelista, filbilageannotationer och associerade filer (`/AF`). Kräver `stripAll` |

Alla parametrar är valfria. Utelämnade fält lämnas oförändrade om inte `stripAll` är satt.

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
- Med `stripAll` innehåller svaret också `stripped`: de Info-nycklar som togs bort (`removed`), om dokumentets XMP-ström togs bort (`xmpRemoved`), vilken PDF/A-nivå indata deklarerade (`pdfa`, eller `null`), hur många XMP-strömmar som togs bort från sidor, bilder och andra objekt (`objectXmpRemoved`), hur många PieceInfo-dictionaryn som togs bort (`pieceInfoRemoved`) och hur många inbäddade filer som togs bort (`attachmentsRemoved`, alltid `0` utan `removeAttachments`). Att ta bort XMP bryter mot PDF/A-konformitet.
- `stripAll` ensamt behåller inbäddade filbilagor, eftersom borttagning ändrar dokumentets innehåll. Lägg till `removeAttachments` för att ta bort dem också. Det tar bort den bifogade XML:en från e-fakturor i ZUGFeRD och Factur-X och bryter mot PDF/A-3-konformitet.
- Att skicka `removeAttachments` utan `stripAll` returnerar 400.
