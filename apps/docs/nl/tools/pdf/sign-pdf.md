---
description: "Stempel geüploade handtekeningafbeeldingen op een PDF met genormaliseerde paginaplaatsingen."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: fe5d034c05b2
---

# Sign PDF {#sign-pdf}

Stempel een of meer geüploade handtekening-PNG-afbeeldingen op een willekeurige pagina van een PDF. Deze route gebruikt een aangepast multipart-contract omdat het de PDF, een of meer handtekeningafbeeldingen en plaatsingscoördinaten nodig heeft.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Accepteert multipart-formuliergegevens. De PDF wordt verzonden als `file`; handtekeningen worden verzonden als `sig0`, `sig1`, enzovoort; plaatsingen worden verzonden in een JSON-veld `placements`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Te ondertekenen PDF-bestand |
| sig0 | file | Ja | - | Eerste handtekeningafbeelding. Extra afbeeldingen gebruiken `sig1`, `sig2`, enzovoort |
| placements | JSON string | Ja | - | Array van plaatsingsobjecten: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | Nee | - | Optionele UUID voor voortgangstracering via SSE |
| fileId | string | Nee | - | Optionele bestandsbibliotheek-ID om het ondertekende resultaat als een nieuwe versie op te slaan |

## Placement Coordinates {#placement-coordinates}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| sig | integer | Index van de handtekeningafbeelding. `0` verwijst naar `sig0` |
| page | integer | Nulgebaseerde PDF-pagina-index |
| x | number | Linkerpositie als paginafractie |
| y | number | Bovenpositie als paginafractie |
| w | number | Handtekeningbreedte als paginafractie |
| h | number | Handtekeninghoogte als paginafractie |

Coördinaten gebruiken een oorsprong linksboven. Waarden mogen iets buiten de paginarand uitlopen; de PDF-renderer knipt de uiteindelijke stempel bij op de pagina.

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

Als het verzoek niet binnen het synchrone wachtvenster kan worden afgerond, geeft de API het volgende terug:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Maak verbinding met `/api/v1/jobs/<jobId>/progress` en download het resultaat wanneer de taak is voltooid.

## Notes {#notes}

- Geaccepteerd PDF-invoerformaat: `.pdf`.
- Handtekeningafbeeldingen moeten geldige afbeeldingsbestanden zijn, doorgaans PNG met transparantie.
- Er worden tot 100 handtekeningafbeeldingen en 100 plaatsingen geaccepteerd.
- `sign-pdf` is een aangepaste route en gebruikt niet het standaard JSON-veld `settings` van het hulpmiddel.
