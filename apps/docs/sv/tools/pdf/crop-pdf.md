---
description: "Beskär alla sidor i en PDF med marginaler eller till ett område."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: f923480456f3
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

Beskär alla sidor i en PDF med en marginal på varje kant, en separat marginal per kant eller ner till ett område, till exempel en fraktetikett som är utskriven i ett hörn av arket.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| mode | string | Nej | `uniform` | `uniform`, `sides`, eller `region` |
| margin | number | Nej | `20` | Läge `uniform`: beskärningsmarginal för varje kant i punkter (0-2000) |
| top, right, bottom, left | number | Nej | `0` | Läge `sides`: beskärningsmarginal för varje kant separat i punkter (0-2000) |
| x, y | number | Nej | `0` | Läge `region`: områdets avstånd från sidans vänstra och övre kant i punkter |
| width, height | number | Nej | `288`, `432` | Läge `region`: områdets storlek i punkter (en etikett på 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Behåll bara etiketten på 4x6 in i det övre vänstra hörnet av varje sida:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Alla värden anges i PDF-punkter (1 punkt = 1/72 tum). En US Letter-sida är 612 x 792 punkter.
- Varje läge läser bara sina egna fält, så en förfrågan som bara skickar `margin` fortsätter att fungera.
- Ett område mäts från det övre vänstra hörnet på varje sida och måste rymmas inom varje sida. Marginalerna måste lämna kvar en del av varje sida. Annars misslyckas förfrågan med `400`.
- På en sida som är inställd att visas roterad hänvisar positioner och kanter till sidan så som den visas, så ett områdes övre vänstra hörn är det övre vänstra hörnet på den roterade sidan.
- Varje läge mäter från hela mediarutan, så att beskära en sida som redan är beskuren börjar om från hela sidan. En enhetlig marginal på `0` visar hela mediarutan.
