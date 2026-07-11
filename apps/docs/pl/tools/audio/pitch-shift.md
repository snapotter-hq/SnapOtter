---
description: "Podnieś lub obniż wysokość dźwięku o półtony bez zmiany prędkości."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: cb329dcf09e0
---

# Zmiana wysokości dźwięku {#pitch-shift}

Podnieś lub obniż wysokość dźwięku pliku audio o określoną liczbę półtonów bez zmiany prędkości jego odtwarzania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| semitones | integer | Nie | `3` | Półtony do przesunięcia (-12 do 12). Musi być niezerowe. |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Uwagi {#notes}

- Wartości dodatnie podnoszą wysokość dźwięku; wartości ujemne ją obniżają.
- Przesunięcie o 12 półtonów równa się jednej oktawie w górę; -12 równa się jednej oktawie w dół.
- Czas trwania odtwarzania pozostaje taki sam niezależnie od wielkości przesunięcia.
- Wyjście zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane awaryjnie jako MP3.
