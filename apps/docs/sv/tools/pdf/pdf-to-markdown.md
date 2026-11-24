---
description: "Konvertera en PDF till Markdown och behåll rubriker, listor och tabeller där PDF-filen har dem."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 92fa1cf67b59
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

Gör om en PDF till en Markdown-fil som du kan lägga i en wiki, på en statisk webbplats eller i en LLM-pipeline.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Tar emot multipart-formulärdata med en PDF-fil.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp en PDF så får du en `.md`-fil tillbaka.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

En stor PDF kan ta längre tid än synkfönstret. API:t svarar då `202` med en `jobId`, och du följer förloppet på `/api/v1/jobs/{jobId}/progress`.

## What gets kept {#what-gets-kept}

En PDF lagrar placerad text, inte struktur, så konverteraren härleder den:

- **Rubriker.** Korta rader som är tydligt större än brödtexten blir rubriker från `#` till `######`, rangordnade efter storlek i hela dokumentet.
- **Listor.** Rader som börjar med en punkt eller ett nummer blir listposter.
- **Fetstil, kursiv och länkar.** Behålls i texten. Bara länkar av typen `http`, `https` och `mailto` finns kvar.
- **Tabeller.** Tabeller ritade med linjer blir Markdown-tabeller. Tabeller som bara är uppställda med mellanrum kommer oftast ut som vanliga stycken.

Bilder tas bort. Layouter med flera kolumner och ovanliga sidutformningar hanteras efter bästa förmåga, så kontrollera resultatet innan du förlitar dig på det.

## Notes {#notes}

- Godkänt indataformat: `.pdf`.
- Fältet `chars` i svaret är längden på Markdown-utdata.
- En skannad PDF har inget textlager att konvertera. Verktyget avvisar den med `422` och koden `NO_TEXT_LAYER` i stället för att returnera en tom fil. Använd verktyget [PDF OCR](./ocr-pdf) för sådana filer.
- För rundturen läser [Markdown till PDF](../files/markdown-to-pdf), [Markdown till DOCX](../files/markdown-to-docx) och [Markdown till HTML](../files/markdown-to-html) `.md`-filer.
