---
description: "Zmienia tekst na WIELKIE, małe litery, Tytułowy, Zdaniowy i inne."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: b0e6d27eea80
i18n_hash_version: 2
---

# Zmiana wielkości liter {#convert-case}

Wklej tekst, wybierz wielkość liter i skopiuj wynik. Tekst trafia na Twój własny serwer SnapOtter i nigdzie indziej.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Przyjmuje treść JSON, a nie dane formularza multipart, i odpowiada skonwertowanym tekstem zamiast plikiem do pobrania.

## Parameters {#parameters}

| Nazwa | Typ | Domyślny | Opis |
|------|------|---------|-------------|
| `text` | string | (wymagany) | Tekst do konwersji. Do 1 000 000 znaków. |
| `mode` | string | (wymagany) | Jeden z poniższych trybów. |
| `locale` | string | (brak) | Znacznik języka BCP 47, na przykład `tr` lub `de`, dla liter, których wielkość zależy od języka. Bez niego wielkość liter jest taka sama dla każdego języka. |

| Tryb | Wejście | Wyjście |
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

- `title` zostawia krótkie angielskie słowa (a, an, and, of, the, to i podobne) małymi literami, chyba że zaczynają lub kończą wiersz. `capitalized` zapisuje wielką literą każde słowo.
- `sentence` zaczyna nowe zdanie na początku tekstu, po podziale wiersza oraz po `.`, `!`, `?` lub `…` po których następuje spacja, więc kropka w `snapotter.com` lub `3.5` się nie liczy.
- `camel`, `pascal`, `snake` i `kebab` dzielą tekst na spacjach, znakach interpunkcyjnych i istniejących zmianach wielkości liter (`XMLHttpRequest` staje się `xml_http_request`) i konwertują każdy wiersz osobno.
- Gdy `locale` ma wartość `tr`, `i` zamienia się na wielkie litery jako `İ`, a `I` na małe jako `ı`. Niemieckie `ß` zamienia się na wielkie litery jako `SS` w każdym ustawieniu regionalnym.
- Aplikacja webowa wysyła aktualny język interfejsu jako `locale`.
