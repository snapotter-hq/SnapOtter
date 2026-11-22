---
description: "Cambia il testo in MAIUSCOLO, minuscolo, Title Case, maiuscola a inizio frase e altro."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: d2844913403d
i18n_hash_version: 2
---

# Converti maiuscole e minuscole {#convert-case}

Incolla del testo, scegli una modalità e copia il risultato. Il testo va al tuo server SnapOtter e da nessun'altra parte.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Accetta un corpo JSON, non dati form multipart, e risponde con il testo convertito invece di un file da scaricare.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (obbligatorio) | Testo da convertire. Fino a 1.000.000 di caratteri. |
| `mode` | string | (obbligatorio) | Una delle modalità qui sotto. |
| `locale` | string | (nessuno) | Tag di lingua BCP 47, come `tr` o `de`, per le lettere la cui maiuscola dipende dalla lingua. Senza, la conversione è la stessa per ogni lingua. |

| Mode | Input | Output |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` lascia in minuscolo le parole inglesi brevi (a, an, and, of, the, to e simili), a meno che non aprano o chiudano la riga. `capitalized` mette in maiuscolo ogni parola.
- `sentence` inizia una nuova frase all'inizio del testo, dopo un a capo e dopo `.`, `!`, `?` o `…` seguiti da uno spazio, quindi il punto in `snapotter.com` o `3.5` non conta.
- `camel`, `pascal`, `snake` e `kebab` dividono su spazi, punteggiatura e cambi di maiuscole già presenti (`XMLHttpRequest` diventa `xml_http_request`) e convertono ogni riga separatamente.
- Con `locale` impostato su `tr`, `i` diventa maiuscolo `İ` e `I` diventa minuscolo `ı`. Il tedesco `ß` diventa maiuscolo `SS` in ogni locale.
- L'app web invia la lingua corrente dell'interfaccia come `locale`.
