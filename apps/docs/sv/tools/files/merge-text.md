---
description: "Kombinera flera text- eller Markdown-filer till en, i den ordning du väljer."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: a95b7e42de8b
i18n_hash_version: 2
---

# Sammanfoga textfiler {#merge-text}

Kombinera flera text- eller Markdown-filer till en enda fil. Filerna fogas samman i uppladdningsordning, så ändra ordningen i fillistan innan du kör om den spelar roll.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Tar emot multipart-formulärdata med två eller fler textfiler och en valfri JSON-sträng `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Vad som sätts mellan filerna: `"blank-line"`, `"rule"` (en `---`-rad) eller `"filename-heading"` (varje fils namn som rubrik) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Anteckningar {#notes}

- Tar emot `.txt`-, `.md`-, `.markdown`-, `.csv`- och `.log`-filer, mellan 2 och 50 per förfrågan.
- Varje fil måste vara UTF-8-text. En binärfil eller en fil som inte är UTF-8 avvisas, och dess namn visas i felet.
- När alla indata har samma filändelse behåller utdata den (`merged.md`, `merged.log`). Blandade indata ger `merged.txt`.
- Med `filename-heading` använder Markdown-utdata `# name.md`-rubriker, medan utdata i oformaterad text använder `==> name.txt <==`-markörrader.
- Tomma rader i slutet av varje fil tas bort så att avgränsaren hamnar rent mellan dokumenten. Ett inledande byte-order mark tas bort.
- CSV-filer sammanfogas som oformaterad text. Använd [Slå samman CSV-filer](./merge-csvs) för att kombinera tabeller med en enda rubrikrad.
- `.eml`-e-postfiler stöds inte ännu.
