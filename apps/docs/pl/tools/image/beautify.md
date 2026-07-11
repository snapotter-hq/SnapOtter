---
description: "Zamień zwykłe zrzuty ekranu w dopracowane obrazy z gradientowymi tłami, ramkami urządzeń, cieniami i rozmiarami dla mediów społecznościowych."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: a0c74ae04b53
---

# Upiększ zrzut ekranu {#beautify-screenshot}

Dodaj gradientowe tła, ramki urządzeń, cienie, znaki wodne i rozmiary dla mediów społecznościowych do zrzutów ekranu. Idealne do tworzenia dopracowanych obrazów na potrzeby marketingu produktu, mediów społecznościowych i dokumentacji.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Nie | `"linear-gradient"` | Typ tła: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | Nie | `"#667eea"` | Jednolity kolor tła (używany, gdy `backgroundType` to `solid`) |
| gradientStops | array | Nie | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Punkty koloru gradientu (min. 2). Każdy punkt ma `color` (hex) i `position` (0-100). |
| gradientAngle | number | Nie | 135 | Kąt gradientu w stopniach (0 do 360) |
| padding | number | Nie | 64 | Odstęp wokół obrazu w pikselach (0 do 256) |
| borderRadius | number | Nie | 12 | Zaokrąglenie narożników zrzutu ekranu (0 do 64) |
| shadowPreset | string | Nie | `"subtle"` | Predefiniowany cień: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | Nie | 20 | Niestandardowy promień rozmycia cienia (0 do 100, używany, gdy `shadowPreset` to `custom`) |
| shadowOffsetX | number | Nie | 0 | Niestandardowe przesunięcie poziome cienia (-50 do 50) |
| shadowOffsetY | number | Nie | 10 | Niestandardowe przesunięcie pionowe cienia (-50 do 50) |
| shadowColor | string | Nie | `"#000000"` | Niestandardowy kolor cienia w formacie hex |
| shadowOpacity | number | Nie | 30 | Niestandardowa nieprzezroczystość cienia (0 do 100) |
| frame | string | Nie | `"none"` | Ramka urządzenia lub okna: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | Nie | - | Tekst tytułu wyświetlany na paskach tytułowych ramek okien |
| socialPreset | string | Nie | `"none"` | Zmień rozmiar do wymiarów mediów społecznościowych: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | Nie | - | Opcjonalny tekst znaku wodnego nakładany na obraz |
| watermarkPosition | string | Nie | `"bottom-right"` | Pozycja znaku wodnego: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | Nie | 50 | Nieprzezroczystość znaku wodnego (0 do 100) |
| outputFormat | string | Nie | `"png"` | Format wyjściowy: `png`, `jpeg`, `webp` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Z obrazem tła {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Uwagi {#notes}

- Przyjmuje dwa pola plików: `file` (wymagane, główny zrzut ekranu) oraz `backgroundImage` (opcjonalne, używane, gdy `backgroundType` to `image`).
- Obsługuje formaty wejściowe HEIC, RAW, PSD i SVG (automatycznie dekodowane).
- Predefiniowane ustawienia cienia mapują się na konkretne wartości:
  - `subtle`: rozmycie 20, offsetY 4, nieprzezroczystość 20%
  - `medium`: rozmycie 40, offsetY 10, nieprzezroczystość 35%
  - `dramatic`: rozmycie 80, offsetY 20, nieprzezroczystość 50%
- Predefiniowane ustawienia mediów społecznościowych zmieniają rozmiar końcowego wyniku, aby dopasować go do docelowych wymiarów, przy użyciu trybu `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Ramki urządzeń (`iphone`, `macbook`, `ipad`) dodają sprzętową obwódkę wokół obrazu i pomijają ustawienie `borderRadius`.
- Gdy wymagana jest przezroczystość (cień, zaokrąglenie narożników, ramki urządzeń lub przezroczyste tło), wynik jest wymuszany na PNG, nawet jeśli wybrano `jpeg`.
- Obrazy tła nie są obsługiwane w trybie potoku/wsadowym.
