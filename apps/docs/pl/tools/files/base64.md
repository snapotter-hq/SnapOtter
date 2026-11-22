---
description: "Koduje tekst do Base64 lub dekoduje Base64 z powrotem do tekstu."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 57427f2d837e
i18n_hash_version: 2
---

# Kodowanie i dekodowanie Base64 {#base64}

Wklej tekst, aby otrzymać Base64, albo wklej Base64, aby odzyskać tekst, a następnie skopiuj wynik. Tekst trafia na Twój własny serwer SnapOtter i nigdzie indziej.

Aby zamienić obraz na Base64, użyj zamiast tego narzędzia [Obraz na Base64](/pl/tools/image/image-to-base64).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Przyjmuje treść JSON, a nie dane formularza multipart, i odpowiada skonwertowanym tekstem zamiast plikiem do pobrania.

## Parameters {#parameters}

| Nazwa | Typ | Domyślny | Opis |
|------|------|---------|-------------|
| `text` | string | (wymagany) | Tekst do zakodowania lub Base64 do zdekodowania. Do 1 000 000 znaków. |
| `mode` | string | (wymagany) | `encode` lub `decode`. |
| `urlSafe` | boolean | `false` | Przy kodowaniu używa alfabetu bezpiecznego dla adresów URL (`-` i `_`) i pomija dopełnienie `=`. Ignorowane przy dekodowaniu. |

## Example Request {#example-request}

Kodowanie:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Dekodowanie:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- Tekst jest kodowany jako UTF-8, więc litery z akcentami, znaki CJK i emoji przechodzą w obie strony bez zmian.
- Dekodowanie ignoruje spacje i podziały wierszy, więc Base64 zawinięte w 76 kolumnach (e-mail, treść PEM) jest dekodowane tak, jak zostało wklejone.
- Dekodowanie akceptuje dane z dopełnieniem `=` lub bez niego, w alfabecie standardowym (`+`, `/`) albo bezpiecznym dla adresów URL (`-`, `_`), ale nie w mieszance obu.
- Dane wejściowe, które nie są Base64, kończą się błędem 400 z kodem `ENCODED_TEXT_INVALID`. Poprawne Base64, które dekoduje się do danych binarnych (obraz, ZIP), a nie do tekstu UTF-8, kończy się błędem `DECODED_DATA_NOT_TEXT`.
