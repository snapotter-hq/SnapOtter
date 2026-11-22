---
description: "Los de regel van drie op: bereken X uit drie bekende waarden."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 57bcc0be344f
i18n_hash_version: 2
---

# Verhoudingsrekenmachine {#proportion-calculator}

Los de regel van drie (kruiselings vermenigvuldigen) op. Voer drie waarden in, kies directe of omgekeerde evenredigheid en krijg de vierde waarde. De waarden blijven na elk antwoord in het formulier staan, zodat je één getal kunt wijzigen en op Enter kunt drukken voor de volgende poging.

Dit is de wiskundige verhoudingsoplosser, niet het fotocompositieraster van de regel van derden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Accepteert een JSON-body, geen multipart form data, en antwoordt met een getal in plaats van een bestand om te downloaden.

## Parameters {#parameters}

| Naam | Type | Standaard | Beschrijving |
|------|------|---------|-------------|
| `a` | number | (vereist) | Eerste bekende waarde. |
| `b` | number | (vereist) | De waarde die bij `a` hoort. |
| `c` | number | (vereist) | Derde bekende waarde. X is de waarde die erbij hoort. |
| `mode` | string | `direct` | `direct` of `inverse`. |

| Modus | Leest als | Formule | Voorbeeld |
|------|----------|---------|---------|
| `direct` | A is tot B zoals C tot X | X = B × C ÷ A | 3 appels kosten 6, dus 10 appels kosten 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 arbeiders doen er 6 dagen over, dus 8 arbeiders doen er 3 dagen over |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- Het antwoord wordt afgerond op 15 significante cijfers, dus `0.1 × 3 ÷ 3` komt terug als `0.1` in plaats van `0.10000000000000002`.
- `a` mag bij een directe evenredigheid niet `0` zijn en `c` mag bij een omgekeerde niet `0` zijn, omdat elk daarvan de deler is. Beide geven een 400 terug.
- Een antwoord buiten het bereik dat een double kan bevatten (boven ongeveer `1.8e308`, of te dicht bij nul om de precisie te behouden) geeft een 400 terug.
- In de webapp kun je `1,5` of `1.5` typen, en ook Arabisch-Indische of Devanagari-cijfers werken. Duizendtalscheidingstekens worden niet geaccepteerd.
