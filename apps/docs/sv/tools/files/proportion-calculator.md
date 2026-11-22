---
description: "Lös reguladetri och hitta X utifrån tre kända värden."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 59ee87f15926
i18n_hash_version: 2
---

# Proportionskalkylator {#proportion-calculator}

Lös reguladetri (korsmultiplikation). Skriv in tre värden, välj direkt eller omvänd proportion och få det fjärde. Värdena stannar kvar i formuläret efter varje svar, så du kan ändra ett tal och trycka på Enter för att prova nästa.

Det här är den matematiska proportionslösaren, inte rutnätet för fotokomposition enligt tredjedelsregeln.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Tar emot en JSON-kropp, inte multipart-formulärdata, och svarar med ett tal i stället för en fil att ladda ner.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (obligatorisk) | Första kända värdet. |
| `b` | number | (obligatorisk) | Värdet som hör ihop med `a`. |
| `c` | number | (obligatorisk) | Tredje kända värdet. X är värdet som hör ihop med det. |
| `mode` | string | `direct` | `direct` eller `inverse`. |

| Läge | Läses som | Formel | Exempel |
|------|----------|---------|---------|
| `direct` | A förhåller sig till B som C till X | X = B × C ÷ A | 3 äpplen kostar 6, så 10 äpplen kostar 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 arbetare behöver 6 dagar, så 8 arbetare behöver 3 dagar |

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

- Svaret avrundas till 15 signifikanta siffror, så `0.1 × 3 ÷ 3` kommer tillbaka som `0.1` i stället för `0.10000000000000002`.
- `a` kan inte vara `0` i en direkt proportion och `c` kan inte vara `0` i en omvänd, eftersom var och en är divisorn. Båda ger ett 400.
- Ett svar utanför det intervall som en double kan hålla (över cirka `1.8e308`, eller för nära noll för att behålla precisionen) ger ett 400.
- I webbappen kan du skriva `1,5` eller `1.5`, och arabiskt-indiska eller devanagari-siffror fungerar också. Tusentalsavgränsare accepteras inte.
