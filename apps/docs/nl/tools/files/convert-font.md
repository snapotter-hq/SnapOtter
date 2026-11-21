---
description: "Converteer lettertypen tussen TTF, OTF, WOFF en WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: b86e19067023
i18n_hash_version: 2
---

# Lettertype converteren {#convert-font}

Converteert een lettertypebestand tussen TrueType (TTF), OpenType CFF (OTF), WOFF en WOFF2. Gebruik het om van een desktoplettertype een weblettertype te maken, of om een TTF uit een OTF te halen voor een app die alleen TrueType accepteert.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Accepteert multipart form data met een `.ttf`-, `.otf`-, `.woff`- of `.woff2`-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Verplicht | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `ttf` | Uitvoerformaat: `ttf`, `otf`, `woff` of `woff2` |

## Voorbeeldaanvraag {#example-request}

OTF naar TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF naar WOFF2 voor het web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Opmerkingen {#notes}

- WOFF en WOFF2 zijn gecomprimeerde verpakkingen rond dezelfde lettertypegegevens, dus converteren naar of vanuit die formaten laat de contouren ongewijzigd.
- OTF naar TTF zet kubische (CFF) curven om in kwadratische TrueType-curven. Elke curve blijft binnen 1 lettertype-eenheid van het origineel, wat op normale groottes onzichtbaar is, maar de conversie is niet exact omkeerbaar. TTF naar OTF behoudt de vorm van de curven en rondt alleen controlepunten af op hele lettertype-eenheden.
- De insluitingsrechten van het lettertype (het OS/2-veld `fsType`) blijven ongewijzigd.
- Lettertypecollecties (`.ttc`) worden niet ondersteund. Variabele TrueType-lettertypen kunnen niet naar OTF worden geconverteerd en variabele CFF2-lettertypen niet naar TTF; converteer die in plaats daarvan naar WOFF of WOFF2.
- De conversie draait in de Python-documentworker met dezelfde time-out als de andere documenttools, niet in het API-proces.
