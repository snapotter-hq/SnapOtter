---
description: "Risolve la regola del tre e trova X a partire da tre valori noti."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 99ee6f263e9e
i18n_hash_version: 2
---

# Calcolatore di proporzioni {#proportion-calculator}

Risolve la regola del tre (prodotto incrociato). Inserisci tre valori, scegli diretta o inversa e ottieni il quarto. I valori restano nel form dopo ogni risposta, così puoi cambiare un numero e premere Invio per provare il calcolo successivo.

Questo è il risolutore matematico di proporzioni, non la griglia della regola dei terzi per la composizione fotografica.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Accetta un corpo JSON, non dati form multipart, e risponde con un numero invece di un file da scaricare.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (obbligatorio) | Primo valore noto. |
| `b` | number | (obbligatorio) | Il valore che corrisponde a `a`. |
| `c` | number | (obbligatorio) | Terzo valore noto. X è il valore che gli corrisponde. |
| `mode` | string | `direct` | `direct` o `inverse`. |

| Mode | Si legge | Formula | Esempio |
|------|----------|---------|---------|
| `direct` | A sta a B come C sta a X | X = B × C ÷ A | 3 mele costano 6, quindi 10 mele costano 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 operai impiegano 6 giorni, quindi 8 operai impiegano 3 giorni |

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

- La risposta è arrotondata a 15 cifre significative, quindi `0.1 × 3 ÷ 3` torna come `0.1` anziché `0.10000000000000002`.
- `a` non può essere `0` in una proporzione diretta e `c` non può essere `0` in una inversa, perché ciascuno è il divisore. In entrambi i casi la risposta è un 400.
- Una risposta fuori dall'intervallo che un double può contenere (sopra circa `1.8e308`, o troppo vicina a zero per mantenere la precisione) restituisce un 400.
- Nell'app web puoi digitare `1,5` o `1.5`, e funzionano anche le cifre arabo-indiane o devanagari. I separatori delle migliaia non sono accettati.
