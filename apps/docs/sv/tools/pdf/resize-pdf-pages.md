---
description: "Ändra storlek på varje sida i en PDF till A4, Letter, en fraktetikett på 4x6 tum eller en anpassad storlek."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: d231b41479b7
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

Ändra sidstorleken på varje sida i en PDF. Innehållet skalas för att passa den nya sidan och centreras, så text, vektorgrafik och streckkoder förblir skarpa. Använd det för att göra om en fraktetikett till en sida på 4x6 tum för en termoskrivare, eller för att flytta ett dokument mellan A4 och US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| pageSize | string | Nej | `"4x6in"` | Målstorlek: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` eller `custom` |
| width | number | Nej | `4` | Anpassad sidbredd, används när `pageSize` är `custom` |
| height | number | Nej | `6` | Anpassad sidhöjd, används när `pageSize` är `custom` |
| unit | string | Nej | `"in"` | Enhet för den anpassade storleken: `in` eller `mm` |
| keepOrientation | boolean | Nej | `false` | Vänd målstorleken så att den matchar varje sidas orientering i stället för att tvinga fram bredd gånger höjd |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- Sidor skalas för att passa, aldrig sträckas. När bildformatet skiljer sig lämnas det överblivna utrymmet tomt.
- Storleksändringen beskär inte. En etikett som är utskriven på en fjärdedel av en Letter- eller A4-sida fyller fortfarande bara en fjärdedel av den nya sidan.
- Anpassade storlekar måste vara 0,5-200 tum (12,7-5080 mm) på varje sida.
- Sidans storlek ändras utifrån dess beskärningsruta när den har en, så en beskuren sida behåller bara det beskurna området.
