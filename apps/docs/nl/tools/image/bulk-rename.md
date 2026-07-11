---
description: "Hernoem meerdere bestanden met een patroonsjabloon en download ze als ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 81e94f6cfbd1
---

# Bulk hernoemen {#bulk-rename}

Hernoem meerdere bestanden met een patroonsjabloon met plaatshouders voor index, opgevulde index en originele bestandsnaam. Retourneert een ZIP-archief met alle hernoemde bestanden.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Accepteert multipart form data met meerdere bestanden en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| pattern | string | Nee | `"image-{{index}}"` | Naamgevingspatroon met plaatshouders (max. 1000 tekens) |
| startIndex | number | Nee | `1` | Startindexnummer |

### Patroonplaatshouders {#pattern-placeholders}

| Plaatshouder | Beschrijving | Voorbeeld |
|-------------|-------------|---------|
| `{{index}}` | Volgnummer beginnend vanaf `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Volgnummer opgevuld met nullen | `01`, `02`, `03` |
| `{{original}}` | Originele bestandsnaam zonder extensie | `photo`, `IMG_001` |

De originele bestandsextensie blijft altijd behouden.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Dit produceert: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Met gebruik van de originele bestandsnaam:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Dit produceert: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Voorbeeldantwoord {#example-response}

Het antwoord is een ZIP-bestand dat direct wordt gestreamd (geen JSON-antwoord). De antwoordheaders zijn:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Opmerkingen {#notes}

- Deze tool verwerkt geen afbeeldingen. Hij hernoemt alleen bestanden en verpakt ze in een ZIP-archief.
- De opvulbreedte met nullen voor `{{padded}}` wordt automatisch bepaald op basis van het totale aantal bestanden (100 bestanden zouden bijvoorbeeld 3-cijferige opvulling gebruiken: `001`, `002`, enz.).
- Bestandsextensies blijven behouden van de originele bestandsnamen.
- Bestandsnamen worden opgeschoond om onveilige tekens te verwijderen.
- Er moet ten minste één bestand worden opgegeven.
