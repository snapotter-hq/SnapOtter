---
description: "Usuń metadane EXIF, GPS, ICC i XMP z obrazów dla prywatności i mniejszego rozmiaru plików."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: e96a07138b5c
---

# Usuwanie metadanych obrazu {#remove-metadata}

Usuń metadane EXIF, GPS, profile kolorów ICC oraz XMP z obrazów. Przydatne dla prywatności (usuwanie współrzędnych GPS, informacji o aparacie) oraz zmniejszania rozmiaru pliku.

## Punkty końcowe API {#api-endpoints}

### Usuwanie metadanych {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Przetwarza obraz i zwraca oczyszczoną wersję z usuniętymi wybranymi metadanymi.

### Inspekcja metadanych {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Zwraca sparsowane metadane jako JSON bez modyfikowania obrazu. Przydatne do podglądu, jakie metadane istnieją, przed ich usunięciem.

## Parametry (Usuwanie) {#parameters-strip}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Nie | `false` | Usuń dane EXIF (ustawienia aparatu, daty itp.) |
| stripGps | boolean | Nie | `false` | Usuń tylko dane GPS/lokalizacji |
| stripIcc | boolean | Nie | `false` | Usuń profil kolorów ICC |
| stripXmp | boolean | Nie | `false` | Usuń metadane XMP (Adobe, IPTC) |
| stripAll | boolean | Nie | `true` | Usuń wszystkie metadane naraz |

Gdy `stripAll` ma wartość `true`, zastępuje ono poszczególne flagi i usuwa wszystko.

## Przykładowe żądanie {#example-request}

Usuń wszystkie metadane:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Usuń tylko dane GPS (zachowaj informacje o aparacie i profil kolorów):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Sprawdź metadane bez modyfikowania:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Przykładowa odpowiedź (Usuwanie) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Przykładowa odpowiedź (Inspekcja) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Uwagi {#notes}

- Obraz jest ponownie kodowany w oryginalnym formacie po usunięciu metadanych. JPEG używa mozjpeg z jakością 90, PNG używa poziomu kompresji 9, WebP używa jakości 85.
- Usunięcie profili ICC może powodować subtelne przesunięcia kolorów, jeśli obraz był oznaczony profilem innym niż sRGB. Użyj `stripIcc: false`, jeśli dokładność kolorów ma znaczenie.
- Punkt końcowy inspekcji parsuje współrzędne GPS na dziesiętne wartości szerokości/długości geograficznej (poprzedzone podkreśleniem) dla wygody.
- Obsługiwane formaty wejściowe: JPEG, PNG, WebP, AVIF, TIFF, GIF.
