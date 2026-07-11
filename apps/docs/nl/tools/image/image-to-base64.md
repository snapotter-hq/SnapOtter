---
description: "Converteer afbeeldingen naar base64 data-URI's om in te bedden in HTML, CSS en meer."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: dba8b755d7b8
---

# Afbeelding naar Base64 {#image-to-base64}

Converteer een of meer afbeeldingen naar base64-gecodeerde strings en data-URI's. Ondersteunt optionele formaatconversie, kwaliteitsbeheer en vergroten/verkleinen. Handig om afbeeldingen rechtstreeks in te bedden in HTML, CSS, JSON of e-mailsjablonen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Accepteert multipart-formuliergegevens met een of meer afbeeldingsbestanden en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Nee | `"original"` | Converteren vóór codering: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Nee | `80` | Uitvoerkwaliteit voor lossy formaten (1 tot 100) |
| maxWidth | number | Nee | `0` | Maximale breedte in pixels (0 = niet vergroten/verkleinen, zal niet vergroten) |
| maxHeight | number | Nee | `0` | Maximale hoogte in pixels (0 = niet vergroten/verkleinen, zal niet vergroten) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Meerdere bestanden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Antwoordvelden {#response-fields}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| results | array | Succesvol geconverteerde afbeeldingen |
| errors | array | Afbeeldingen die niet verwerkt konden worden (met bestandsnaam en foutmelding) |

### Result-object {#result-object}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| filename | string | Oorspronkelijke bestandsnaam |
| mimeType | string | MIME-type van de gecodeerde uitvoer |
| width | number | Uiteindelijke breedte in pixels (na eventueel vergroten/verkleinen) |
| height | number | Uiteindelijke hoogte in pixels (na eventueel vergroten/verkleinen) |
| originalSize | number | Oorspronkelijke bestandsgrootte in bytes |
| encodedSize | number | Grootte van de base64-string in bytes |
| overheadPercent | number | Procentueel groottevers chil ten opzichte van het origineel (positief = groter, negatief = kleiner) |
| base64 | string | Ruwe base64-gecodeerde afbeeldingsgegevens |
| dataUri | string | Volledige data-URI klaar voor gebruik in `src`-attributen |

## Opmerkingen {#notes}

- Base64-codering vergroot de grootte doorgaans met ongeveer 33% in vergelijking met het binaire bestand. Het veld `overheadPercent` toont het werkelijke verschil.
- Wanneer `outputFormat` `"original"` is, worden HEIC/HEIF-bestanden geconverteerd naar JPEG (aangezien browsers HEIC niet kunnen weergeven in data-URI's).
- De opties `maxWidth` en `maxHeight` verkleinen met `fit: inside` en `withoutEnlargement`, zodat afbeeldingen kleiner dan de opgegeven afmetingen niet worden vergroot.
- Meerdere bestanden kunnen in één verzoek worden verwerkt. Elk bestand wordt onafhankelijk verwerkt, en fouten verhinderen niet dat andere bestanden slagen.
- SVG-bestanden worden doorgegeven als `image/svg+xml` zonder hercodering (tenzij een formaatconversie wordt aangevraagd).
- Dit is een alleen-lezen endpoint. Het produceert geen downloadbaar bestand of `jobId`. De base64-gegevens worden rechtstreeks in de antwoordbody geretourneerd.
