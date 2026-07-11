---
description: "Wycina fragment z pliku audio przez podanie czasu początkowego i końcowego."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: b7e0bdd4f8b9
---

# Trim Audio {#trim-audio}

Wycina fragment z pliku audio przez podanie czasu początkowego i końcowego w sekundach.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| startS | number | Nie | `0` | Czas początkowy w sekundach (minimum 0) |
| endS | number | Tak | - | Czas końcowy w sekundach (musi być po początku) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Czasy są podawane w sekundach i mogą zawierać ułamki dziesiętne (np. `10.5`).
- Wartość `endS` musi być większa niż `startS`.
- Jeśli `endS` przekracza czas trwania audio, plik jest przycinany do końca.
- Wynik zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane jako MP3.
