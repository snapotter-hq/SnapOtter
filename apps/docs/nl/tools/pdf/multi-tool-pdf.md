---
description: "Herorden, roteer, verwijder en haal pagina's uit andere PDF's in één editor of via de API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 3b03b4095693
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Stel een PDF samen vanuit een expliciet pagina-plan: herorden, dupliceer, roteer of verwijder pagina's, en haal pagina's uit extra PDF's, allemaal in één verzoek.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Accepteert multipart-formuliergegevens met een of meer PDF-bestanden en een JSON `settings`-veld.
Per verzoek worden maximaal 20 invoerdocumenten en 1.200 uitvoerpagina's ondersteund.

## Parameters {#parameters}

| Parameter | Type | Verplicht | Beschrijving |
|-----------|------|----------|-------------|
| items | array | Ja | Uitvoerpagina-plan, in uitvoerorder. Elk item is `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indexeert de geüploade bestanden in uploadvolgorde (0-gebaseerd); `page` is een 1-gebaseerd paginanummer in dat document. |
| pageCounts | array | Ja | Werkelijk aantal pagina's van elk geüpload document, in dezelfde volgorde. Een planpagina die het aantal pagina's van het document overschrijdt, wordt geweigerd met 400. |

## Voorbeeldverzoek {#example-request}

Neem pagina 3 en 1 van het eerste document en vervolgens pagina 1 en 2 van het tweede, waarbij de eerste uitvoerpagina 90° met de klok mee wordt geroteerd:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Opmerkingen {#notes}

- Dezelfde pagina kan meerdere keren in `items` voorkomen om te dupliceren.
- Pagina's die niet in `items` staan, worden weggelaten in de uitvoer.
- `rot` registreert de nieuwe weergaveoriëntatie op de gekopieerde pagina (samengesteld met eventuele bestaande rotatie); de pagina-inhoud blijft ongewijzigd.
- Rotatie wordt per uitvoerkopie toegepast, zodat duplicaten verschillende rotaties kunnen hebben.
- De uitvoer is een nieuw, plat document; bronbladwijzers en documentniveau-metagegevens worden niet behouden.
- Verwerking vereist het qpdf-binaire bestand, dat wordt meegeleverd in de officiële Docker-image.
