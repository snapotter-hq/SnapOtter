---
description: "Simuleer hoe afbeeldingen worden waargenomen door mensen met verschillende soorten kleurenblindheid."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: c769c6c24b89
---

# Kleurenblindheidssimulatie {#color-blindness-simulation}

Simuleer kleurzichtstoornissen (CVD) om te bekijken hoe afbeeldingen eruitzien voor mensen met verschillende soorten kleurenblindheid. Nuttig voor het toegankelijkheidstesten van ontwerpen, grafieken en UI.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| simulationType | string | Nee | `"deuteranomaly"` | Type kleurzichtstoornis om te simuleren |

### Simulatietypes {#simulation-types}

| Waarde | Aandoening | Beschrijving |
|-------|-----------|-------------|
| `protanopia` | Roodblind | Volledige afwezigheid van rode kegeltjes |
| `deuteranopia` | Groenblind | Volledige afwezigheid van groene kegeltjes |
| `tritanopia` | Blauwblind | Volledige afwezigheid van blauwe kegeltjes |
| `protanomaly` | Roodzwak | Verminderde gevoeligheid van rode kegeltjes |
| `deuteranomaly` | Groenzwak | Verminderde gevoeligheid van groene kegeltjes (meest voorkomend) |
| `tritanomaly` | Blauwzwak | Verminderde gevoeligheid van blauwe kegeltjes |
| `achromatopsia` | Volledig kleurenblind | Volledige afwezigheid van kleurzicht |
| `blueConeMonochromacy` | Alleen blauwe kegeltjes | Alleen blauwe kegeltjes functioneel |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Opmerkingen {#notes}

- Deuteranomalie (groenzwak) is de standaard omdat dit de meest voorkomende vorm van kleurzichtstoornis is, die ongeveer 6% van de mannen treft.
- De simulatie gebruikt kleurtransformatiematrices die modelleren hoe verminderde of afwezige kegelfotoreceptoren de waargenomen kleuren veranderen.
- Deze tool is non-destructief en produceert alleen een voorbeeld. De originele afbeelding wordt niet aangepast voor toegankelijkheid.
- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór verwerking.
