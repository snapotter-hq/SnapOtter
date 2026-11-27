---
description: "Rozwiązuje regułę trzech, wyznacza X z trzech znanych wartości."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: e7700f455f85
i18n_hash_version: 2
---

# Kalkulator proporcji {#proportion-calculator}

Rozwiązuje regułę trzech (mnożenie na krzyż). Wpisz trzy wartości, wybierz proporcję prostą lub odwrotną i otrzymaj czwartą. Wartości zostają w formularzu po każdej odpowiedzi, więc możesz zmienić jedną liczbę i nacisnąć Enter, aby wypróbować kolejną.

To matematyczny solver proporcji, a nie siatka kompozycji zdjęć oparta na regule trójpodziału.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Przyjmuje treść JSON, a nie dane formularza multipart, i odpowiada liczbą zamiast plikiem do pobrania.

## Parameters {#parameters}

| Nazwa | Typ | Domyślny | Opis |
|------|------|---------|-------------|
| `a` | number | (wymagany) | Pierwsza znana wartość. |
| `b` | number | (wymagany) | Wartość odpowiadająca `a`. |
| `c` | number | (wymagany) | Trzecia znana wartość. X to wartość, która jej odpowiada. |
| `mode` | string | `direct` | `direct` lub `inverse`. |

| Tryb | Czyta się | Wzór | Przykład |
|------|----------|---------|---------|
| `direct` | A tak się ma do B, jak C do X | X = B × C ÷ A | 3 jabłka kosztują 6, więc 10 jabłek kosztuje 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 robotników potrzebuje 6 dni, więc 8 robotników potrzebuje 3 dni |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- Odpowiedź jest zaokrąglana do 15 cyfr znaczących, więc `0.1 × 3 ÷ 3` wraca jako `0.1`, a nie `0.10000000000000002`.
- `a` nie może być `0` w proporcji prostej, a `c` nie może być `0` w odwrotnej, ponieważ każda z tych wartości jest dzielnikiem. W obu przypadkach zwracany jest błąd 400.
- Odpowiedź poza zakresem, który może pomieścić typ double (powyżej około `1.8e308` lub zbyt blisko zera, by zachować precyzję), zwraca błąd 400.
- W aplikacji webowej możesz wpisać `1,5` lub `1.5`, a działają też cyfry arabsko-indyjskie i dewanagari. Separatory tysięcy nie są akceptowane.
