---
description: "Converteer een EPUB naar PDF, DOCX, HTML of Markdown."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: 6b2e26cd9b1b
---

# Convert EPUB {#convert-epub}

Converteer een EPUB-e-book naar PDF, Word (DOCX), HTML of Markdown. Externe bronnen binnen het boek worden niet opgehaald.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Accepteert multipart-formulierdata met een EPUB-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Uitvoerformaat: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## Example Response {#example-response}

Retourneert `202 Accepted`. Volg de voortgang via SSE op `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Geaccepteerd invoerformaat: `.epub`.
- Externe bronnen die in de EPUB zijn ingesloten (externe afbeeldingen, lettertypen) worden om veiligheidsredenen niet opgehaald.
- De afbeeldingskwaliteit in de geconverteerde uitvoer kan variëren afhankelijk van de EPUB-structuur.
- De conversie wordt uitgevoerd door Pandoc op de server.
