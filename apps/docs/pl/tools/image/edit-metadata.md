---
description: "Edytuj pola metadanych EXIF, IPTC, GPS i XMP w obrazach bez ponownego kodowania pikseli."
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: d5065d34ee21
---

# Edycja metadanych {#edit-metadata}

Edytuj pola metadanych obrazu, w tym EXIF, IPTC, współrzędne GPS, daty i słowa kluczowe. Wykorzystuje pod spodem ExifTool, więc metadane są zapisywane w miejscu bez ponownego kodowania pikseli, zachowując pełną jakość obrazu.

## Punkty końcowe API {#api-endpoints}

### Edycja metadanych {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Zapisuje pola metadanych do obrazu i zwraca zmodyfikowany plik.

### Sprawdzanie metadanych {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Zwraca pełne metadane z obrazu za pomocą ExifTool w formacie JSON. Nie modyfikuje obrazu.

## Parametry (Edycja) {#parameters-edit}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| title | string | Nie | - | Tytuł obrazu (XMP/EXIF) |
| author | string | Nie | - | Nazwa autora |
| artist | string | Nie | - | Nazwa artysty (znacznik EXIF Artist) |
| copyright | string | Nie | - | Nota o prawach autorskich |
| imageDescription | string | Nie | - | Opis obrazu (EXIF) |
| software | string | Nie | - | Znacznik oprogramowania |
| dateTime | string | Nie | - | Wartość EXIF DateTime |
| dateTimeOriginal | string | Nie | - | Wartość EXIF DateTimeOriginal |
| setAllDates | string | Nie | - | Ustaw wszystkie pola dat naraz |
| dateShift | string | Nie | - | Przesuń wszystkie daty o wartość (format: `+HH:MM` lub `-HH:MM`) |
| clearGps | boolean | Nie | `false` | Usuń wszystkie dane GPS |
| gpsLatitude | number | Nie | - | Ustaw szerokość geograficzną GPS (od -90 do 90) |
| gpsLongitude | number | Nie | - | Ustaw długość geograficzną GPS (od -180 do 180) |
| gpsAltitude | number | Nie | - | Ustaw wysokość GPS w metrach |
| keywords | string[] | Nie | - | Słowa kluczowe/tagi do dodania lub ustawienia |
| keywordsMode | string | Nie | `"add"` | Sposób obsługi słów kluczowych: `add` (dołącz) lub `set` (zastąp) |
| fieldsToRemove | string[] | Nie | `[]` | Lista nazw konkretnych pól metadanych do usunięcia |
| iptcTitle | string | Nie | - | IPTC Object Name |
| iptcHeadline | string | Nie | - | IPTC Headline |
| iptcCity | string | Nie | - | IPTC City |
| iptcState | string | Nie | - | IPTC Province/State |
| iptcCountry | string | Nie | - | IPTC Country |

## Przykładowe żądanie {#example-request}

Ustawianie autora i praw autorskich:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Ustawianie współrzędnych GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Usuwanie GPS i dodawanie słów kluczowych:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Sprawdzanie metadanych:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Przykładowa odpowiedź (Edycja) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Uwagi {#notes}

- To narzędzie wymaga zainstalowanego na serwerze ExifTool. Jest on dołączony do obrazu Docker.
- Metadane są zapisywane w miejscu, więc nie następuje ponowne kodowanie pikseli. Zmiana rozmiaru pliku jest minimalna (tylko bajty metadanych).
- Parametr `dateShift` przesuwa wszystkie pola dat o określoną wartość, co jest przydatne do korygowania błędów stref czasowych (np. `+02:00` lub `-05:30`).
- Jeśli nie zażądano żadnych zmian (wszystkie parametry pominięte lub puste), oryginalny plik jest zwracany bez zmian.
- Obsługiwane formaty: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- W przypadku formatów, których nie można podejrzeć w przeglądarce (HEIF, TIFF), odpowiedź zawiera pole `previewUrl` z podglądem WebP.
