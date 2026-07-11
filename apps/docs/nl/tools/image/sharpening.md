---
description: "Afbeeldingen verscherpen met adaptieve, unsharp mask- of high-passmethoden, met optionele ruisonderdrukking."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: 6f670017465b
---

# Verscherping {#sharpening}

Geavanceerd verscherpingsgereedschap met drie methoden: adaptief (slim, randbewust), unsharp mask (klassiek radius/hoeveelheid) en high-pass (nadruk op textuur). Bevat ingebouwde ruisonderdrukking om verscherpingsartefacten te voorkomen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Accepteert multipart form data met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| method | string | Nee | `"adaptive"` | Verscherpingsalgoritme: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | Nee | `1.0` | Adaptief: Gaussische sigma (0.5 tot 10) |
| m1 | number | Nee | `1.0` | Adaptief: verscherping van vlakke gebieden (0 tot 10) |
| m2 | number | Nee | `3.0` | Adaptief: verscherping van gekartelde gebieden (0 tot 20) |
| x1 | number | Nee | `2.0` | Adaptief: drempel vlak/gekarteld (0 tot 10) |
| y2 | number | Nee | `12` | Adaptief: maximale verscherping vlak (0 tot 50) |
| y3 | number | Nee | `20` | Adaptief: maximale verscherping gekarteld (0 tot 50) |
| amount | number | Nee | `100` | Unsharp mask: verscherpingshoeveelheid (0 tot 1000) |
| radius | number | Nee | `1.0` | Unsharp mask: vervagingsradius in pixels (0.1 tot 5) |
| threshold | number | Nee | `0` | Unsharp mask: minimaal helderheidsverschil om te verscherpen (0 tot 255) |
| strength | number | Nee | `50` | High-pass: filtersterkte (0 tot 100) |
| kernelSize | number | Nee | `3` | High-pass: grootte van de convolutiekernel (3 of 5) |
| denoise | string | Nee | `"off"` | Ruisonderdrukking vóór verscherpen: `off`, `light`, `medium`, `strong` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Unsharp mask met drempel om gladde gebieden te beschermen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Opmerkingen {#notes}

- Alleen de parameters die relevant zijn voor de gekozen methode worden gebruikt. Bijvoorbeeld: `amount`, `radius` en `threshold` worden genegeerd wanneer `method` `adaptive` is.
- De adaptieve methode gebruikt de ingebouwde adaptieve verscherping van Sharp met configureerbaar gedrag voor vlakke/gekartelde gebieden.
- De optie `denoise` past ruisonderdrukking toe vóór het verscherpen om versterking van ruis/korrel te voorkomen.
- High-passverscherping haalt fijne details naar voren door een vervaagde versie van het origineel af te trekken en dat vervolgens terug te mengen.
- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór verwerking.
