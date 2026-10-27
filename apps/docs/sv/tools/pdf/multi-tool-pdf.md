---
description: "Ordna om, rotera, ta bort och hämta in sidor från andra PDF-filer i en editor eller via API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 9ece227b5b55
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Bygg ihop en PDF från en explicit sidplan: ordna om, duplicera, rotera eller ta bort sidor, och hämta in sidor från ytterligare PDF-filer – allt i en begäran.

## API-endpunkt {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Accepterar multipart-formulärdata med en eller flera PDF-filer och ett JSON-fält `settings`.
Upp till 20 indokument och 1 200 utgångssidor stöds per begäran.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Beskrivning |
|-----------|------|----------|-------------|
| items | array | Ja | Utgångssidplan i utgångsordning. Varje objekt är `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indexerar de uppladdade filerna i uppladdningsordning (0-baserat); `page` är ett 1-baserat sidnummer i det dokumentet. |
| pageCounts | array | Ja | Verkligt sidantal för varje uppladdat dokument i samma ordning. En plansida utöver dokumentets sidantal avvisas med 400. |

## Exempelbegäran {#example-request}

Ta sidorna 3 och 1 från det första dokumentet, sedan sidorna 1 och 2 från det andra, och rotera den första utgångssidan 90° medurs:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Anteckningar {#notes}

- Samma sida kan förekomma flera gånger i `items` för att duplicera den.
- Sidor som saknas i `items` utelämnas från utdata.
- `rot` registrerar den nya visningsorienteringen på den kopierade sidan (sammansatt med eventuell befintlig rotation); sidinnehållet påverkas inte.
- Rotation tillämpas per utgångskopia, så duplicat kan ha olika rotationer.
- Utdata är ett nytt, platt dokument; källbokmärken och dokumentnivåmetadata bevaras inte.
- Bearbetning kräver qpdf-binären, som ingår i den officiella Docker-avbildningen.
