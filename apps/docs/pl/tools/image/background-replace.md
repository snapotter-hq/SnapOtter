---
description: "Zamień tło obrazu na jednolity kolor lub gradient za pomocą AI."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: bb4f654dfdc7
---

# Zamiana tła {#background-replace}

Zamień tło obrazu na jednolity kolor lub gradient. Model AI wykrywa obiekt, usuwa oryginalne tło i komponuje obiekt na wybranym przez Ciebie tle.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Nie | `"color"` | Tryb tła: `color` lub `gradient` |
| color | string | Nie | `"#ffffff"` | Kolor tła w formacie hex (gdy backgroundType to `color`) |
| gradientColor1 | string | Nie | - | Pierwszy kolor gradientu w formacie hex |
| gradientColor2 | string | Nie | - | Drugi kolor gradientu w formacie hex |
| gradientAngle | integer | Nie | `180` | Kąt gradientu w stopniach (0-360) |
| feather | integer | Nie | `0` | Promień wygładzania krawędzi (0-20) |
| format | string | Nie | `"png"` | Format wyjściowy: `png` lub `webp` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
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
- Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetworzeniem.
- Wynik domyślnie jest w formacie PNG, aby zachować przezroczystość wokół obiektu.
