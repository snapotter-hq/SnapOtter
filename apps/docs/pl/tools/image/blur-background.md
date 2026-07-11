---
description: "Rozmyj tło, zachowując ostrość obiektu za pomocą AI."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 565e394980a9
---

# Rozmyj tło {#blur-background}

Rozmyj tło obrazu, zachowując ostrość obiektu. Model AI izoluje obiekt, stosuje rozmycie do oryginalnego tła i komponuje ostry obiekt na wierzchu.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| intensity | integer | Nie | `50` | Intensywność rozmycia (1-100) |
| feather | integer | Nie | `0` | Promień wygładzania krawędzi (0-20) |
| format | string | Nie | `"png"` | Format wyjściowy: `png` lub `webp` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Śledź postęp przez SSE pod `GET /api/v1/jobs/{jobId}/progress`. Po zakończeniu zadania strumień SSE emituje zdarzenie `completed` z adresem URL pobierania.

## Uwagi {#notes}

- To narzędzie wspomagane przez AI, które zwraca `202 Accepted` i przetwarza asynchronicznie. Połącz się z punktem końcowym SSE, aby otrzymywać aktualizacje postępu i wynik końcowy.
- Wymaga zainstalowanego pakietu funkcji **background-removal**. Zwraca `501`, jeśli pakiet nie jest dostępny.
- Wyższe wartości intensywności dają silniejszy efekt rozmycia. Wartości powyżej 80 tworzą wyraźne oddzielenie w stylu bokeh.
- Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetworzeniem.
