---
description: "Genereer QR-codes met aangepaste kleuren en niveaus van foutcorrectie."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 96c7770048b3
---

# QR Code Generator {#qr-code-generator}

Genereer QR-code-afbeeldingen uit tekst of URL's met een instelbare grootte, niveau van foutcorrectie en aangepaste voorgrond-/achtergrondkleuren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Accepteert een **JSON body** (geen multipart). Er is geen bestandsupload nodig.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Inhoud die in de QR-code wordt gecodeerd (1 tot 2000 tekens) |
| size | number | Nee | `400` | Breedte/hoogte van de uitvoerafbeelding in pixels (100 tot 10000) |
| errorCorrection | string | Nee | `"M"` | Niveau van foutcorrectie: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | Nee | `"#000000"` | Voorgrond-/modulekleur van de QR-code in hex (`#RRGGBB`) |
| background | string | Nee | `"#FFFFFF"` | Achtergrondkleur van de QR-code in hex (`#RRGGBB`) |
| logoDataUri | string | Nee | - | Logo-afbeelding als data-URI (`data:image/png;base64,...` of `data:image/jpeg;base64,...`, max. 700 KB). Gecentreerd op de QR-code op 22% van de QR-grootte. Forceert foutcorrectie naar `H` |

### Error Correction Levels {#error-correction-levels}

| Niveau | Herstel | Toepassing |
|-------|----------|----------|
| `L` | ~7% | Maximale datadichtheid |
| `M` | ~15% | Gebalanceerd (standaard) |
| `Q` | ~25% | Goed voor gedrukte codes |
| `H` | ~30% | Best voor codes met een logo-overlay |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

QR-code met huisstijl en aangepaste kleuren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- Dit endpoint accepteert JSON, geen multipart form data, aangezien er geen afbeeldingsupload nodig is.
- De uitvoer is altijd een PNG-afbeelding.
- De uitvoerbestandsnaam is altijd `qrcode.png`.
- `originalSize` is altijd 0 omdat deze tool afbeeldingen vanaf nul genereert.
- Rondom de QR-code is een rustzone (marge) van 2 modules opgenomen.
- De maximale tekstlengte is 2000 tekens. De werkelijke capaciteit hangt af van het niveau van foutcorrectie en de tekencodering.
- Hogere niveaus van foutcorrectie zorgen ervoor dat de QR-code scanbaar blijft, zelfs als deze gedeeltelijk bedekt is, maar verminderen de datacapaciteit.
- Wanneer een `logoDataUri` is opgegeven, wordt de foutcorrectie automatisch geforceerd naar `H` (30%), zodat de QR-code scanbaar blijft ondanks dat het logo het midden bedekt.
