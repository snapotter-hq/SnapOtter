---
description: "Bereken de ontbrekende breedte of hoogte die een beeldverhouding behoudt en vereenvoudig de verhouding."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 42117e9e586d
i18n_hash_version: 2
---

# Beeldverhouding-calculator {#aspect-ratio-calculator}

Voer een oorspronkelijke breedte en hoogte in, gevolgd door een nieuwe breedte of een nieuwe hoogte, en krijg de andere zijde terug zodat de verhoudingen gelijk blijven. De verhouding komt in de eenvoudigste vorm terug, dus 1920 × 1080 is 16:9. In de webapp kun je beginnen met een gangbare verhouding (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) en wisselen tussen liggend en staand.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Accepteert een JSON-body, geen multipart form data, en antwoordt met getallen in plaats van een bestand om te downloaden.

## Parameters {#parameters}

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|-----------|--------------|
| `width` | number | (vereist) | Oorspronkelijke breedte. |
| `height` | number | (vereist) | Oorspronkelijke hoogte. |
| `newWidth` | number | - | Doelbreedte. Het antwoord berekent `newHeight` hieruit. |
| `newHeight` | number | - | Doelhoogte. Het antwoord berekent `newWidth` hieruit. |
| `round` | boolean | `true` | Rond de berekende zijde af op een geheel getal. Bij `false` blijven twee decimalen behouden. |

Elke afmeting moet tussen `0.0001` en `1000000` liggen. Stuur `newWidth` of `newHeight`, niet beide. Laat beide weg om alleen de vereenvoudigde verhouding te krijgen.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` en `newHeight` zijn `null` wanneer de aanvraag geen van beide bevatte.

## Opmerkingen {#notes}

- Fractionele afmetingen worden teruggebracht tot een verhouding van hele getallen met maximaal vier decimalen, dus `8.5` × `11` komt terug als `17:22`.
- `ratioDecimal` is de breedte gedeeld door de hoogte, afgerond op vier decimalen.
- Een berekende zijde komt nooit terug als `0`. Met afronding aan is het minimaal `1`, en met afronding uit minimaal `0.01`.
- Als je zowel `newWidth` als `newHeight` stuurt, of een afmeting buiten het toegestane bereik, krijg je een 400 terug.
- De calculator leest of schrijft nooit een bestand. Om de getallen toe te passen, gebruik je [Afbeelding herschalen](/nl/tools/image/resize) of [Afbeelding bijsnijden](/nl/tools/image/crop).
