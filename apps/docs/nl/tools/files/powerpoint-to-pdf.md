---
description: "Converteer presentaties naar PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 46ab812ff4a4
---

# PowerPoint naar PDF {#powerpoint-to-pdf}

Converteer PowerPoint- of OpenDocument-presentaties naar PDF, met één dia per pagina.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Accepteert multipart form data met een PowerPoint/ODP-bestand.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een presentatie en deze wordt naar PDF geconverteerd.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Voorbeeldantwoord {#example-response}

Retourneert `202 Accepted`. Volg de voortgang via SSE op `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Opmerkingen {#notes}

- Geaccepteerde invoerformaten: `.pptx`, `.ppt`, `.odp`.
- Elke dia wordt één pagina in de PDF.
- De conversie wordt uitgevoerd door LibreOffice, dat headless op de server draait.
- Animaties en overgangen worden niet opgenomen in de PDF-uitvoer.
