---
description: "Oblicz brakującą szerokość lub wysokość, która zachowuje proporcje obrazu, i uprość stosunek boków."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 0a298b54d241
i18n_hash_version: 2
---

# Kalkulator proporcji obrazu {#aspect-ratio-calculator}

Podaj oryginalną szerokość i wysokość, a następnie nową szerokość lub nową wysokość, aby otrzymać drugi wymiar z zachowaniem proporcji. Stosunek boków jest zwracany w najprostszej postaci, więc 1920 × 1080 to 16:9. W aplikacji webowej możesz zacząć od popularnej proporcji (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) i przełączać się między orientacją poziomą i pionową.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Przyjmuje treść JSON (nie multipart) i zwraca liczby zamiast pliku do pobrania.

## Parametry {#parameters}

| Nazwa | Typ | Domyślnie | Opis |
|------|------|---------|-------------|
| `width` | number | (wymagany) | Oryginalna szerokość. |
| `height` | number | (wymagany) | Oryginalna wysokość. |
| `newWidth` | number | - | Docelowa szerokość. Na jej podstawie odpowiedź oblicza `newHeight`. |
| `newHeight` | number | - | Docelowa wysokość. Na jej podstawie odpowiedź oblicza `newWidth`. |
| `round` | boolean | `true` | Zaokrągla obliczony wymiar do liczby całkowitej. Gdy `false`, zachowuje dwa miejsca po przecinku. |

Każdy wymiar musi mieścić się między `0.0001` a `1000000`. Wyślij `newWidth` albo `newHeight`, nie oba naraz. Pomiń oba, aby otrzymać tylko uproszczony stosunek boków.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` i `newHeight` mają wartość `null`, gdy żądanie nie zawierało żadnego z nich.

## Uwagi {#notes}

- Wymiary ułamkowe są sprowadzane do stosunku liczb całkowitych z dokładnością do czterech miejsc po przecinku, więc `8.5` × `11` daje `17:22`.
- `ratioDecimal` to szerokość podzielona przez wysokość, zaokrąglona do czterech miejsc po przecinku.
- Obliczony wymiar nigdy nie wynosi `0`. Przy włączonym zaokrąglaniu jest to co najmniej `1`, a przy wyłączonym co najmniej `0.01`.
- Wysłanie jednocześnie `newWidth` i `newHeight` lub wymiaru spoza dozwolonego zakresu zwraca błąd 400.
- Kalkulator nigdy nie odczytuje ani nie zapisuje plików. Aby zastosować te liczby, użyj narzędzia [Zmień rozmiar obrazu](/pl/tools/image/resize) lub [Kadruj obraz](/pl/tools/image/crop).
