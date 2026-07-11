---
description: "Extrahera återkommande element från XML till en CSV-tabell."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 172befb82143
---

# XML till CSV {#xml-to-csv}

Extrahera återkommande element från en XML-fil till en platt CSV-tabell. Verktyget hittar automatiskt den första arrayen av objekt i XML-trädet och mappar varje element till en rad.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Tar emot multipart-formulärdata med en XML-fil. Inget settings-fält krävs.

## Parametrar {#parameters}

Det här verktyget har inga konfigurerbara parametrar. Det återkommande elementet identifieras automatiskt utifrån XML-strukturen.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Anteckningar {#notes}

- Endast `.xml`-filer godtas som indata.
- Verktyget söker igenom XML-trädet efter den första återkommande uppsättningen syskonelement och använder dem som rader.
- Varje unikt barnelement- eller attributnamn blir en CSV-kolumnrubrik.
- Detta är en enkelriktad konvertering. För dubbelriktad JSON/XML-konvertering, använd verktyget [JSON till XML](/sv/tools/files/json-xml).
