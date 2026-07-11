---
description: "Dostosuj jasność, kontrast, nasycenie, temperaturę, odcień, kanały i zastosuj efekty kolorystyczne."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 0b53e6a1f986
---

# Dostosuj kolory {#adjust-colors}

Kompleksowe narzędzie do dostosowywania kolorów, łączące jasność, kontrast, ekspozycję, nasycenie, temperaturę, tinting, obrót odcienia, poziomy poszczególnych kanałów oraz efekty jednym kliknięciem (skala szarości, sepia, inwersja) w jednym punkcie końcowym.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| brightness | number | Nie | `0` | Regulacja jasności (-100 do 100) |
| contrast | number | Nie | `0` | Regulacja kontrastu (-100 do 100) |
| exposure | number | Nie | `0` | Ekspozycja / gamma tonów średnich (-100 do 100) |
| saturation | number | Nie | `0` | Nasycenie koloru (-100 do 100) |
| temperature | number | Nie | `0` | Balans bieli: chłodny/niebieski do ciepłego/pomarańczowego (-100 do 100) |
| tint | number | Nie | `0` | Przesunięcie odcienia: zielony do magenty (-100 do 100) |
| hue | number | Nie | `0` | Obrót odcienia w stopniach (-180 do 180) |
| sharpness | number | Nie | `0` | Siła wyostrzania (0 do 100) |
| red | number | Nie | `100` | Poziom kanału czerwonego (0 do 200, 100 = bez zmian) |
| green | number | Nie | `100` | Poziom kanału zielonego (0 do 200, 100 = bez zmian) |
| blue | number | Nie | `100` | Poziom kanału niebieskiego (0 do 200, 100 = bez zmian) |
| effect | string | Nie | `"none"` | Efekt kolorystyczny: `none`, `grayscale`, `sepia`, `invert` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Zastosuj ciepły, vintage'owy wygląd:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Uwagi {#notes}

- Wszystkie parametry mają domyślnie wartości neutralne, więc możesz regulować tylko to, czego potrzebujesz.
- Regulacje są stosowane w tej kolejności: jasność, kontrast, ekspozycja, nasycenie/odcień, temperatura/tint, wyostrzanie, kanały, efekty.
- Temperatura używa macierzy rekombinacji kolorów 3x3 na osiach niebiesko-pomarańczowej i zielono-magentowej.
- Ekspozycja mapuje się na funkcję gamma Sharpa (wartości dodatnie rozjaśniają tony średnie, ujemne je przyciemniają).
- Ten punkt końcowy odpowiada również pod starszymi ścieżkami `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` oraz `/api/v1/tools/image/color-effects`. Wszystkie używają tego samego schematu.
- Format wyjściowy odpowiada formatowi wejściowemu. Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetworzeniem.
