---
description: "Zmień nazwy wielu plików za pomocą szablonu wzorca i pobierz jako ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 05d89869a52f
---

# Masowa zmiana nazw {#bulk-rename}

Zmień nazwy wielu plików za pomocą szablonu wzorca z symbolami zastępczymi dla indeksu, uzupełnionego indeksu i oryginalnej nazwy pliku. Zwraca archiwum ZIP zawierające wszystkie pliki ze zmienionymi nazwami.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Przyjmuje dane formularza multipart z wieloma plikami oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| pattern | string | Nie | `"image-{{index}}"` | Wzorzec nazewnictwa z symbolami zastępczymi (maks. 1000 znaków) |
| startIndex | number | Nie | `1` | Początkowy numer indeksu |

### Symbole zastępcze wzorca {#pattern-placeholders}

| Symbol zastępczy | Opis | Przykład |
|-------------|-------------|---------|
| `{{index}}` | Kolejny numer zaczynający się od `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Kolejny numer uzupełniony zerami | `01`, `02`, `03` |
| `{{original}}` | Oryginalna nazwa pliku bez rozszerzenia | `photo`, `IMG_001` |

Oryginalne rozszerzenie pliku jest zawsze zachowywane.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

To daje: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Z użyciem oryginalnej nazwy pliku:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

To daje: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Przykładowa odpowiedź {#example-response}

Odpowiedzią jest plik ZIP strumieniowany bezpośrednio (nie odpowiedź JSON). Nagłówki odpowiedzi to:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Uwagi {#notes}

- To narzędzie nie przetwarza obrazów. Zmienia jedynie nazwy plików i pakuje je do archiwum ZIP.
- Szerokość uzupełnienia zerami dla `{{padded}}` jest określana automatycznie na podstawie łącznej liczby plików (np. 100 plików użyłoby uzupełnienia trzycyfrowego: `001`, `002` itd.).
- Rozszerzenia plików są zachowywane z oryginalnych nazw plików.
- Nazwy plików są oczyszczane w celu usunięcia niebezpiecznych znaków.
- Musi zostać dostarczony co najmniej jeden plik.
