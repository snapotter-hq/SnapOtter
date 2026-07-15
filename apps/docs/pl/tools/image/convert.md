---
description: "Konwertuj obrazy między formatami, w tym nowoczesnymi jak AVIF, JXL i HEIC."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: 7d07d56af008
---

# Konwertuj obraz {#convert}

Konwertuj obrazy między formatami. Obsługuje popularne formaty webowe oraz specjalistyczne, takie jak HEIC, JXL, BMP, ICO, JP2, QOI i PSD.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/convert`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Tak | - | Format docelowy: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Nie | - | Jakość wyjściowa (1-100). Dotyczy formatów stratnych, takich jak jpg, webp, avif, heic. |

## Obsługiwane formaty wyjściowe {#supported-output-formats}

| Format | Typ | Uwagi |
|--------|------|-------|
| jpg | Stratny | JPEG, najlepsza kompatybilność |
| png | Bezstratny | Obsługuje przezroczystość |
| webp | Oba | Nowoczesny format webowy, dobra kompresja |
| avif | Stratny | Format nowej generacji, doskonała kompresja |
| tiff | Oba | Procesy druku/publikacji |
| gif | Bezstratny | Ograniczony do 256 kolorów |
| heic / heif | Stratny | Format ekosystemu Apple |
| jxl | Oba | JPEG XL, format nowej generacji |
| bmp | Bezstratny | Nieskompresowana mapa bitowa |
| ico | Bezstratny | Format ikon Windows |
| jp2 | Stratny | JPEG 2000 |
| qoi | Bezstratny | Format Quite OK Image |
| psd | Warstwowy | Adobe Photoshop (wymaga ImageMagick) |
| ppm | Bezstratny | Portable Pixmap (PPM/PGM/PBM) |
| eps | Wektorowy | Encapsulated PostScript |
| tga | Bezstratny | Format obrazu Targa |

## Przykładowe żądanie {#example-request}

Konwersja do WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Konwersja do PNG (bezstratna):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Uwagi {#notes}

- Rozszerzenie nazwy pliku wyjściowego jest automatycznie aktualizowane, aby pasowało do formatu docelowego.
- Pliki wejściowe SVG są rasteryzowane w 300 DPI przed konwersją.
- Konwersja PSD wymaga zainstalowanego na serwerze ImageMagick.
- Formaty BMP, EPS, ICO, JP2, JXL, PPM, QOI i TGA używają specjalistycznych koderów CLI i pomijają przetwarzanie przez Sharp.
- Kodowanie HEIC/HEIF używa systemowej biblioteki kodera HEIC.
- Formaty wejściowe są szerokie: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW itd.), PSD, SVG, BMP i inne.
