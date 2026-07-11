---
description: "Dodaj obramowania, odstępy, zaokrąglone narożniki i cienie do obrazów w przewidywalnej, kontrolowanej kolejności."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 019f3c59df2f
---

# Obramowanie i ramka {#border-frame}

Dodaj obramowania, odstępy, zaokrąglone narożniki i cienie do obrazów. Narzędzie stosuje efekty w kolejności: odstęp, obramowanie, zaokrąglenie narożników, a następnie cień.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| borderWidth | number | Nie | 10 | Grubość obramowania w pikselach (0 do 2000) |
| borderColor | string | Nie | `"#000000"` | Kolor obramowania w formacie hex (np. `#FF0000`) |
| padding | number | Nie | 0 | Wewnętrzny odstęp między obrazem a obramowaniem w pikselach (0 do 200) |
| paddingColor | string | Nie | `"#FFFFFF"` | Kolor wypełnienia odstępu w formacie hex |
| cornerRadius | number | Nie | 0 | Promień zaokrąglenia narożników w pikselach (0 do 2000) |
| shadow | boolean | Nie | `false` | Czy dodać cień |
| shadowBlur | number | Nie | 15 | Promień rozmycia cienia (1 do 200) |
| shadowOffsetX | number | Nie | 0 | Poziome przesunięcie cienia (-50 do 50) |
| shadowOffsetY | number | Nie | 5 | Pionowe przesunięcie cienia (-50 do 50) |
| shadowColor | string | Nie | `"#000000"` | Kolor cienia w formacie hex |
| shadowOpacity | number | Nie | 40 | Nieprzezroczystość cienia w procentach (0 do 100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Uwagi {#notes}

- Używa standardowej fabryki `createToolRoute`. Przyjmuje pojedynczy plik obrazu przez przesyłanie multipart.
- Obsługuje formaty wejściowe HEIC, RAW, PSD i SVG (automatycznie dekodowane).
- Kolejność przetwarzania: najpierw dodawany jest odstęp, następnie obramowanie owija obraz, potem stosowane jest zaokrąglenie narożników, a na końcu komponowany jest cień.
- Gdy włączone jest `cornerRadius` lub `shadow`, wynik jest wymuszany na PNG (niezależnie od formatu wejściowego), aby zachować przezroczystość. Formaty obsługujące kanał alfa (PNG, WebP, AVIF) zachowują swój oryginalny format.
- Cień uwzględnia kształt: podąża za zaokrąglonymi narożnikami, zamiast tworzyć prostokątny cień.
- Ustawienie `borderWidth` na 0 i użycie tylko `cornerRadius` + `shadow` tworzy efekt zaokrąglonego cienia bez ramki.
