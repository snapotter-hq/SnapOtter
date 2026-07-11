---
description: "Przytnij obraz do wyśrodkowanego koła z przezroczystymi narożnikami."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 9033f4215f42
---

# Przycięcie do koła {#circle-crop}

Przytnij obraz do wyśrodkowanego koła z przezroczystymi narożnikami. Obsługuje regulowany zoom, przesunięcie, obramowanie i rozmiar wyjściowy.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| zoom | number | Nie | `1` | Współczynnik zoomu (1-5); wyższe wartości przycinają ciaśniej |
| offsetX | number | Nie | `0.5` | Pozioma pozycja środka (0-1) |
| offsetY | number | Nie | `0.5` | Pionowa pozycja środka (0-1) |
| borderWidth | integer | Nie | `0` | Szerokość obramowania w pikselach (0-200) |
| borderColor | string | Nie | `"#ffffff"` | Kolor obramowania w formacie hex |
| background | string | Nie | `"transparent"` | Wypełnienie narożników: `"transparent"` lub kolor w formacie hex |
| outputSize | integer | Nie | - | Ostateczny wymiar kwadratu w pikselach (16-4096) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Uwagi {#notes}

- Wynik jest zawsze w formacie PNG, aby zachować przezroczyste narożniki (chyba że `background` jest ustawione na jednolity kolor).
- Koło jest wpisane w krótszy wymiar obrazu. Użyj `zoom`, aby przyciąć ciaśniej, oraz `offsetX`/`offsetY`, aby przesunąć widoczny obszar.
- Gdy podano `outputSize`, wynik jest zmieniany do tego wymiaru kwadratu po przycięciu.
- Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetworzeniem.
