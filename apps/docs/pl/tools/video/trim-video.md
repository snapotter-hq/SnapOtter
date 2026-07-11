---
description: "Wycięcie klipu z wideo poprzez podanie czasu początku i końca."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 0e157bb50c48
---

# Trim Video {#trim-video}

Wycina klip z wideo poprzez podanie czasu początku i końca w sekundach, z opcją cięć z dokładnością do klatki.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| startS | number | Nie | `0` | Czas początku w sekundach (musi być >= 0) |
| endS | number | Tak | - | Czas końca w sekundach (musi być po startS) |
| precise | boolean | Nie | `false` | Ponowne kodowanie dla cięć z dokładnością do klatki zamiast wyszukiwania klatki kluczowej |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Gdy `precise` ma wartość `false` (domyślnie), narzędzie używa wyszukiwania klatek kluczowych, które jest szybkie, ale może rozpocząć się kilka klatek przed żądanym czasem.
- Ustawienie `precise` na `true` powoduje ponowne kodowanie segmentu dla dokładnych granic klatek, ale trwa dłużej.
- Wartość `endS` musi być większa niż `startS`.
