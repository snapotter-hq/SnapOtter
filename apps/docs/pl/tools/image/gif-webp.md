---
description: "Konwertuj animowany GIF na WebP i odwrotnie, zachowując wszystkie klatki."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 716380fe088a
---

# Konwerter GIF/WebP {#gif-webp-converter}

Konwertuj animowane pliki GIF na WebP i odwrotnie, zachowując wszystkie klatki i taktowanie animacji. Animacje WebP są zazwyczaj o 25-35% mniejsze niż równoważne pliki GIF.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Przyjmuje dane formularza multipart z plikiem GIF lub WebP oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| quality | integer | Nie | `80` | Jakość wyjściowa dla kodowania WebP (1-100) |
| lossless | boolean | Nie | `false` | Użyj bezstratnej kompresji WebP |
| resizePercent | integer | Nie | `100` | Skaluj wynik procentowo (10-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Uwagi {#notes}

- Akceptowane są tylko pliki `.gif` i `.webp`. Inne formaty obrazów nie są obsługiwane przez to narzędzie.
- Kierunek konwersji jest automatyczny: wejście GIF daje wyjście WebP, a wejście WebP daje wyjście GIF.
- Opcje `quality` i `lossless` mają zastosowanie tylko podczas kodowania do WebP. Podczas konwersji do GIF wynik używa standardowej palety GIF.
- Użyj `resizePercent`, aby zmniejszyć wymiary (i rozmiar pliku) dużych animacji.
