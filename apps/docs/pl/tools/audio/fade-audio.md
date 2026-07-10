---
description: "Dodaj efekty stopniowego pojawiania się i zanikania dźwięku."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: c90589ae937c
---

# Wyciszanie audio {#fade-audio}

Dodaj efekty stopniowego pojawiania się (fade-in) i zanikania (fade-out) na początku i na końcu pliku audio.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Nie | `1` | Czas trwania pojawiania się w sekundach (0 do 30) |
| fadeOutS | number | Nie | `1` | Czas trwania zanikania w sekundach (0 do 30) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- Ustaw którąkolwiek wartość na `0`, aby pominąć ten kierunek wyciszania. Co najmniej jedna musi być większa niż 0.
- Czas trwania wyciszania jest ograniczany do długości audio, jeśli ją przekracza.
- Wyjście zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane awaryjnie jako MP3.
