---
description: "Linjärisera en PDF för snabb webbvisning (progressiv nedladdning)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: e7c30823278f
---

# Web-Optimize PDF {#web-optimize-pdf}

Linjärisera en PDF så att den kan laddas ner och visas progressivt i webbläsare utan att vänta på hela filen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Tar emot multipart-formulärdata med en PDF-fil. Inget fält `settings` krävs.

## Parameters {#parameters}

Detta verktyg har inga inställningsparametrar. Ladda upp PDF-filen direkt.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- Linjärisering ordnar om PDF-filens interna struktur så att den första sidan kan renderas innan hela filen har laddats ner.
- Utdatafilen kan bli något större än indatafilen på grund av den tillagda linjäriseringsdatan.
- Redan linjäriserade PDF-filer linjäriseras om utan problem.
