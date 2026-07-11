---
description: "Extraheer tekst uit PDF-documenten met AI-gedreven OCR."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 940e2e52bf37
---

# PDF OCR {#pdf-ocr}

Extraheer tekst uit PDF-documenten met AI-gedreven optische tekenherkenning. Ondersteunt meerdere kwaliteitsniveaus en talen. Vereist dat de OCR-functiebundel is geïnstalleerd.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| quality | string | Nee | `"balanced"` | OCR-kwaliteitsniveau: `fast`, `balanced`, `best` |
| language | string | Nee | `"auto"` | Documenttaal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Nee | `"all"` | Paginaselectie, bijv. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

Geeft `202 Accepted` terug. Volg de voortgang via SSE op `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Geaccepteerd invoerformaat: `.pdf`.
- Dit is een AI-hulpmiddel dat vereist dat de **OCR-functiebundel** is geïnstalleerd. Als de bundel niet is geïnstalleerd, geeft de API `501 Not Implemented` terug.
- Het kwaliteitsniveau `fast` gebruikt een lichter model voor snellere verwerking; `best` gebruikt een nauwkeuriger model ten koste van snelheid.
- De taalinstelling `auto` probeert de documenttaal automatisch te detecteren.
- Je kunt specifieke pagina's aanwijzen met bereiken (`"1-3"`), door komma's gescheiden lijsten (`"1,3,5"`), of `"all"` voor elke pagina.
- Voor PDF's die al selecteerbare tekst bevatten, kun je beter het snellere hulpmiddel [PDF to Text](./pdf-to-text) gebruiken.
