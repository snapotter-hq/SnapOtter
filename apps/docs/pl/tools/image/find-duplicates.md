---
description: "Wykrywaj zduplikowane i niemal identyczne obrazy przy użyciu haszowania percepcyjnego."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 86a88fd343b3
---

# Znajdź duplikaty {#find-duplicates}

Prześlij wiele obrazów, aby wykryć duplikaty i niemal identyczne obrazy przy użyciu haszowania percepcyjnego (dHash). Grupuje podobne obrazy razem, identyfikuje wersję o najlepszej jakości w każdej grupie i oblicza potencjalne oszczędności miejsca.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Przyjmuje dane formularza multipart z wieloma plikami obrazów oraz opcjonalnym polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| threshold | number | Nie | `8` | Maksymalna odległość Hamminga uznająca obrazy za duplikaty (0 do 20). Niższa = surowsze dopasowanie |

### Pola plików {#file-fields}

Prześlij co najmniej 2 pliki obrazów w żądaniu multipart (wszystkie używając nazwy pola `file` lub dowolnej nazwy pola dla części plików).

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Pola odpowiedzi {#response-fields}

| Pole | Typ | Opis |
|-------|------|-------------|
| totalImages | number | Liczba pomyślnie przeanalizowanych obrazów |
| duplicateGroups | array | Grupy zduplikowanych obrazów |
| uniqueImages | number | Liczba obrazów nienależących do żadnej grupy duplikatów |
| spaceSaveable | number | Łączna liczba bajtów, którą można zaoszczędzić, usuwając duplikaty inne niż najlepsze |
| skippedFiles | array | Pliki, których nie udało się przetworzyć (z nazwą pliku i powodem) |

### Obiekt grupy duplikatów {#duplicate-group-object}

| Pole | Typ | Opis |
|-------|------|-------------|
| groupId | number | Identyfikator grupy |
| files | array | Obrazy w tej grupie duplikatów |

### Obiekt pliku (w obrębie grupy) {#file-object-within-a-group}

| Pole | Typ | Opis |
|-------|------|-------------|
| filename | string | Oryginalna nazwa pliku |
| similarity | number | Procentowe podobieństwo do obrazu referencyjnego (pierwszego w grupie) |
| width | number | Szerokość obrazu w pikselach |
| height | number | Wysokość obrazu w pikselach |
| fileSize | number | Rozmiar pliku w bajtach |
| format | string | Format obrazu |
| isBest | boolean | Czy jest to wersja o najwyższej jakości (najwięcej pikseli, największy plik) |
| thumbnail | string lub null | Miniatura JPEG w Base64 (szerokość 200px) do podglądu |

## Uwagi {#notes}

- Wykorzystuje 128-bitowy dHash (64-bitowy wiersz + 64-bitowa kolumna) do wykrywania podobieństwa percepcyjnego. Wykrywa to duplikaty nawet po zmianie rozmiaru, ponownej kompresji i drobnych edycjach.
- Próg reprezentuje maksymalną odległość Hamminga między haszami. Domyślna wartość 8 wykrywa niemal identyczne obrazy, unikając fałszywych trafień. Użyj 0 dla identycznych pikselowo, lub 15-20 dla bardzo luźnego dopasowania.
- „Najlepszym” obrazem w każdej grupie jest ten z największą liczbą pikseli (szerokość x wysokość), z rozmiarem pliku jako kryterium rozstrzygającym.
- Wymagane są co najmniej 2 obrazy. Pliki, które nie przejdą walidacji lub dekodowania, są zgłaszane w `skippedFiles`, zamiast powodować niepowodzenie całego żądania.
- Miniatury to podglądy JPEG o szerokości 200px zakodowane jako identyfikatory URI danych.
- Obsługiwane są wszystkie popularne formaty (HEIC, RAW, PSD, SVG dekodowane automatycznie).
