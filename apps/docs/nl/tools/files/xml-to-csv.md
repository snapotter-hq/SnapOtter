---
description: "Haal herhalende elementen uit XML en zet ze in een CSV-tabel."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 409ec6411604
---

# XML naar CSV {#xml-to-csv}

Haal herhalende elementen uit een XML-bestand en zet ze in een platte CSV-tabel. De tool zoekt automatisch de eerste array van objecten in de XML-boom en koppelt elk element aan een rij.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Accepteert multipart form data met een XML-bestand. Er is geen settings-veld vereist.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Het herhalende element wordt automatisch gedetecteerd op basis van de XML-structuur.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Opmerkingen {#notes}

- Alleen `.xml`-bestanden worden als invoer geaccepteerd.
- De tool doorzoekt de XML-boom naar de eerste herhalende set van broer- en zuselementen en gebruikt die als rijen.
- Elke unieke naam van een onderliggend element of attribuut wordt een CSV-kolomkop.
- Dit is een eenrichtingsconversie. Gebruik voor bidirectionele JSON/XML-conversie de tool [JSON naar XML](/nl/tools/files/json-xml).
