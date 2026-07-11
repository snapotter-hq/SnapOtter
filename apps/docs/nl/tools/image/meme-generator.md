---
description: "Maak memes met sjablonen of eigen afbeeldingen, opgemaakte tekstvakken en lettertype-opties."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 4c6ca6298587
---

# Meme Generator {#meme-generator}

Maak memes met ingebouwde sjablonen of eigen afbeeldingen. Voeg tekst toe met klassieke meme-styling (vette, omlijnde tekst), meerdere lay-outvoorinstellingen en lettertypekeuzes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Accepteert een van beide:
- **Multipart form data** met een afbeeldingsbestand en een JSON `settings`-veld (modus voor eigen afbeelding)
- **JSON body** met een `templateId` (sjabloonmodus, geen bestandsupload nodig)

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| templateId | string | Nee | - | ID van ingebouwd meme-sjabloon. Als dit is opgegeven, is geen afbeeldingsupload nodig |
| textLayout | string | Nee | `"top-bottom"` | Lay-out van tekstvak: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Nee | `[]` | Array van tekstvak-objecten met de velden `id` en `text` |
| fontFamily | string | Nee | `"anton"` | Lettertype: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Nee | auto | Lettergrootte in pixels (8 tot 200). Automatisch berekend indien weggelaten |
| textColor | string | Nee | `"#ffffff"` | Vulkleur van de tekst |
| strokeColor | string | Nee | `"#000000"` | Kleur van de tekstomlijning |
| textAlign | string | Nee | `"center"` | Tekstuitlijning: `left`, `center`, `right` |
| allCaps | boolean | Nee | `true` | Tekst omzetten naar hoofdletters |

### Text Boxes {#text-boxes}

Elk item in de `textBoxes`-array moet het volgende hebben:

| Veld | Type | Beschrijving |
|-------|------|-------------|
| id | string | Vak-identificatie die overeenkomt met de lay-out (bijv. `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | De meme-tekst die getoond wordt |

### Text Layout Box IDs {#text-layout-box-ids}

| Lay-out | Beschikbare Box IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Example Request {#example-request}

Eigen afbeelding met tekst boven en onder:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Met een ingebouwd sjabloon (JSON body, geen bestandsupload):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notes {#notes}

- Ofwel `templateId` ofwel een geüpload afbeeldingsbestand is vereist. Als je beide opgeeft, wordt het sjabloon gebruikt.
- Sjablonen bepalen hun eigen posities van tekstvakken; de parameter `textLayout` wordt genegeerd bij gebruik van sjablonen.
- Tekst wordt gerenderd als SVG met omlijningen voor de klassieke meme-look.
- De lettergrootte wordt automatisch berekend om binnen het tekstvak te passen als deze niet expliciet is ingesteld.
- Lege tekstvakken worden overgeslagen (er wordt niets gerenderd als alle vakken leeg zijn).
- De uitvoerbestandsnaam bevat het sjabloon-ID bij gebruik van sjablonen (bijv. `meme-drake.png`).
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd voordat deze wordt verwerkt.
