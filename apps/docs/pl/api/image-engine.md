---
description: "Dokumentacja operacji silnika obrazu. Wszystkie operacje przetwarzania obrazu oparte na Sharp i ich parametry."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 15a5c0432318
---

# Silnik obrazu {#image-engine}

Pakiet `@snapotter/image-engine` obsługuje wszystkie operacje na obrazach niezwiązane z AI. Opakowuje [Sharp](https://sharp.pixelplumbing.com/) i działa w całości w procesie, bez zewnętrznych zależności.

## Operacje {#operations}

### resize {#resize}

Skaluje obraz do określonych wymiarów lub o procent.

| Parametr | Typ | Opis |
|---|---|---|
| `width` | number | Docelowa szerokość w pikselach |
| `height` | number | Docelowa wysokość w pikselach |
| `fit` | string | `cover`, `contain`, `fill`, `inside` lub `outside` |
| `withoutEnlargement` | boolean | Jeśli true, nie powiększa mniejszych obrazów |
| `percentage` | number | Skaluj o procent zamiast wymiarów bezwzględnych |

Możesz ustawić `width`, `height` lub oba. Jeśli ustawisz tylko jeden, drugi jest obliczany w celu zachowania proporcji.

### crop {#crop}

Wytnij prostokątny obszar z obrazu.

| Parametr | Typ | Opis |
|---|---|---|
| `left` | number | Przesunięcie X od lewej krawędzi |
| `top` | number | Przesunięcie Y od górnej krawędzi |
| `width` | number | Szerokość obszaru kadrowania |
| `height` | number | Wysokość obszaru kadrowania |
| `unit` | string | `px` (domyślnie) lub `percent` |

### rotate {#rotate}

Obróć obraz o zadany kąt.

| Parametr | Typ | Opis |
|---|---|---|
| `angle` | number | Kąt obrotu w stopniach (0-360) |
| `background` | string | Kolor wypełnienia dla odsłoniętego obszaru (domyślnie: `#000000`). Dotyczy tylko kątów innych niż 90 stopni. |

### flip {#flip}

Odbij obraz w poziomie, w pionie lub oba. Co najmniej jeden musi być true.

| Parametr | Typ | Opis |
|---|---|---|
| `horizontal` | boolean | Odbij z lewej na prawą |
| `vertical` | boolean | Odbij z góry na dół |

### convert {#convert}

Zmień format obrazu.

| Parametr | Typ | Opis |
|---|---|---|
| `format` | string | Format docelowy: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Jakość kompresji (1-100, dotyczy formatów stratnych) |

Pierwszych siedem formatów (od `jpg` do `jxl`) jest kodowanych przez Sharp w procesie. Pozostałe formaty używają zewnętrznych koderów na warstwie API: `heic`/`heif` przez heif-enc, `bmp`/`ico` przez ImageMagick, `jp2` przez opj_compress, a `qoi` przez wbudowany kodek TypeScript.

### compress {#compress}

Zmniejsz rozmiar pliku przy zachowaniu tego samego formatu.

| Parametr | Typ | Opis |
|---|---|---|
| `quality` | number | Docelowa jakość (1-100) |
| `targetSizeBytes` | number | Opcjonalny docelowy rozmiar pliku w bajtach |
| `format` | string | Opcjonalne nadpisanie formatu |

### strip-metadata {#strip-metadata}

Usuń metadane EXIF, IPTC, XMP i ICC z obrazu. Bez parametrów (lub z `stripAll: true`) usuwa wszystko. Przekaż pojedyncze flagi, aby usuwać selektywnie.

| Parametr | Typ | Opis |
|---|---|---|
| `stripAll` | boolean | Usuń wszystkie metadane (domyślnie, gdy nie ustawiono flag) |
| `stripExif` | boolean | Usuń dane EXIF (w tym GPS, jeśli `stripGps` nie jest ustawione osobno) |
| `stripGps` | boolean | Usuń dane lokalizacji GPS |
| `stripIcc` | boolean | Usuń profil kolorów ICC |
| `stripXmp` | boolean | Usuń metadane XMP |

### Regulacje koloru {#color-adjustments}

Te operacje modyfikują właściwości koloru obrazu. Każda przyjmuje pojedynczą wartość liczbową.

| Operacja | Parametr | Zakres | Opis |
|---|---|---|---|
| `brightness` | `value` | -100 do 100 | Reguluj jasność |
| `contrast` | `value` | -100 do 100 | Reguluj kontrast |
| `saturation` | `value` | -100 do 100 | Reguluj nasycenie koloru |

### Filtry koloru {#color-filters}

Te stosują stałą transformację koloru. Nie przyjmują parametrów.

| Operacja | Opis |
|---|---|
| `grayscale` | Konwertuj do skali szarości |
| `sepia` | Zastosuj tonację sepii |
| `invert` | Odwróć wszystkie kolory |

### Kanały koloru {#color-channels}

Reguluj poszczególne kanały koloru RGB. Wartości są mnożnikami, gdzie 100 = bez zmian.

| Parametr | Typ | Opis |
|---|---|---|
| `red` | number | Mnożnik kanału czerwonego (0 do 200, 100 = bez zmian) |
| `green` | number | Mnożnik kanału zielonego (0 do 200, 100 = bez zmian) |
| `blue` | number | Mnożnik kanału niebieskiego (0 do 200, 100 = bez zmian) |

### sharpen {#sharpen}

Proste wyostrzanie sterowane pojedynczą wartością.

| Parametr | Typ | Opis |
|---|---|---|
| `value` | number | Intensywność wyostrzania (0 do 100). Mapowana na sigmę gaussowską 0.5-10. |

### sharpen-advanced {#sharpen-advanced}

Zaawansowane wyostrzanie z trzema wybieralnymi metodami i opcjonalnym przebiegiem wstępnej redukcji szumu.

| Parametr | Typ | Opis |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` lub `high-pass` |
| `sigma` | number | Promień rozmycia gaussowskiego, 0.5-10 (adaptacyjny) |
| `m1` | number | Wyostrzanie obszarów płaskich, 0-10 (adaptacyjne) |
| `m2` | number | Wyostrzanie obszarów teksturowanych, 0-20 (adaptacyjne) |
| `x1` | number | Próg płaski/postrzępiony, 0-10 (adaptacyjny) |
| `y2` | number | Maks. rozjaśnienie (ograniczenie aureoli), 0-50 (adaptacyjne) |
| `y3` | number | Maks. przyciemnienie (ograniczenie aureoli), 0-50 (adaptacyjne) |
| `amount` | number | Procent intensywności, 0-500 (unsharp-mask) |
| `radius` | number | Promień rozmycia, 0.1-5.0 (unsharp-mask) |
| `threshold` | number | Minimalna jasność krawędzi, 0-255 (unsharp-mask) |
| `strength` | number | Siła mieszania, 0-100 (high-pass) |
| `kernelSize` | number | `3` lub `5` dla jądra 3x3 / 5x5 (high-pass) |
| `denoise` | string | Wstępny przebieg redukcji szumu: `off`, `light`, `medium` lub `strong` |

Parametry są specyficzne dla metody. Podawaj tylko te istotne dla wybranej metody.

### color-blindness {#color-blindness}

Symuluj zaburzenie widzenia barw za pomocą macierzy rekombinacji koloru 3x3.

| Parametr | Typ | Opis |
|---|---|---|
| `type` | string | Jeden z: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Zapisz lub usuń poszczególne pola metadanych EXIF/IPTC bez usuwania całego bloku.

| Parametr | Typ | Opis |
|---|---|---|
| `artist` | string | Tag EXIF Artist |
| `copyright` | string | Tag EXIF Copyright |
| `imageDescription` | string | Tag EXIF ImageDescription |
| `software` | string | Tag EXIF Software |
| `dateTime` | string | Tag EXIF DateTime |
| `dateTimeOriginal` | string | Tag EXIF DateTimeOriginal |
| `clearGps` | boolean | Usuń wszystkie tagi GPS |
| `fieldsToRemove` | string[] | Lista nazw pól EXIF do usunięcia |

Wszystkie parametry są opcjonalne. Pola wymienione w `fieldsToRemove` są usuwane z istniejącego bloku EXIF. Pola ustawione za pomocą nazwanych parametrów są zapisywane (lub nadpisywane). Klucze binarne/niebezpieczne, takie jak MakerNote, są po cichu ignorowane.

## Wykrywanie formatu {#format-detection}

Silnik wykrywa formaty wejściowe automatycznie na podstawie nagłówków plików, a nie tylko rozszerzeń plików. Oznacza to, że plik `.jpg`, który w rzeczywistości jest plikiem PNG, zostanie obsłużony poprawnie. Wykrywanie wykorzystuje podejście wielowarstwowe: najpierw magiczne bajty, a następnie rozszerzenie pliku jako rozwiązanie awaryjne.

SnapOtter obsługuje **ponad 55 formatów wejściowych** i **13 formatów wyjściowych**, w tym 23 formaty RAW aparatów od ponad 20 marek, formaty profesjonalne (PSD, EPS, OpenEXR, HDR), nowoczesne kodeki (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) oraz formaty naukowe/growe (FITS, DDS). Dekodowanie jest obsługiwane natywnie przez Sharp tam, gdzie to możliwe, z automatycznym rozwiązaniem awaryjnym w postaci ImageMagick, LibRaw i wyspecjalizowanych dekoderów CLI.

Zobacz stronę [Obsługiwane formaty](/pl/guide/supported-formats), aby uzyskać pełną listę.

## Ekstrakcja metadanych {#metadata-extraction}

Narzędzie `info` zwraca metadane obrazu. Zobacz [Informacje o obrazie](/pl/tools/image/info), aby uzyskać pełny wykaz pól.

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
