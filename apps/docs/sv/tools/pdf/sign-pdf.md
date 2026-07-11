---
description: "Stämpla uppladdade signaturbilder på en PDF med normaliserade sidplaceringar."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: 661dcb901278
---

# Sign PDF {#sign-pdf}

Stämpla en eller flera uppladdade PNG-signaturbilder på valfri sida i en PDF. Denna rutt använder ett anpassat multipart-kontrakt eftersom den behöver PDF-filen, en eller flera signaturbilder och placeringskoordinater.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Tar emot multipart-formulärdata. PDF-filen skickas som `file`; signaturer skickas som `sig0`, `sig1` och så vidare; placeringar skickas i ett JSON-fält `placements`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | PDF-fil att signera |
| sig0 | file | Ja | - | Första signaturbilden. Ytterligare bilder använder `sig1`, `sig2` och så vidare |
| placements | JSON string | Ja | - | Array av placeringsobjekt: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | Nej | - | Valfri UUID för förloppsspårning via SSE |
| fileId | string | Nej | - | Valfritt fil-bibliotek-ID för att spara det signerade resultatet som en ny version |

## Placement Coordinates {#placement-coordinates}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| sig | integer | Signaturbildindex. `0` mappas till `sig0` |
| page | integer | Noll-baserat PDF-sidindex |
| x | number | Vänsterposition som en sidfraktion |
| y | number | Toppposition som en sidfraktion |
| w | number | Signaturbredd som en sidfraktion |
| h | number | Signaturhöjd som en sidfraktion |

Koordinater använder ett ursprung uppe till vänster. Värden kan blöda något utanför sidkanten; PDF-renderaren beskär den slutliga stämpeln till sidan.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Om begäran inte kan slutföras inom det synkrona väntefönstret returnerar API:et:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Anslut till `/api/v1/jobs/<jobId>/progress` och ladda ner resultatet när jobbet är klart.

## Notes {#notes}

- Godkänt PDF-indataformat: `.pdf`.
- Signaturbilder måste vara giltiga bildfiler, vanligtvis PNG med transparens.
- Upp till 100 signaturbilder och 100 placeringar godtas.
- `sign-pdf` är en anpassad rutt och använder inte det vanliga JSON-fältet `settings` för verktyg.
