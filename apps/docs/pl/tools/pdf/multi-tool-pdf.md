---
description: "Zmień kolejność, obróć, usuń i pobierz strony z innych plików PDF w jednym edytorze lub przez API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: a1e37b036842
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Złóż plik PDF z jawnego planu stron: zmień kolejność, duplikuj, obróć lub usuń strony oraz pobierz strony z dodatkowych plików PDF — wszystko w jednym żądaniu.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Akceptuje dane formularza multipart z jednym lub większą liczbą plików PDF oraz polem JSON `settings`.
W jednym żądaniu obsługiwane są maksymalnie 20 dokumentów wejściowych i 1 200 stron wyjściowych.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Opis |
|-----------|------|----------|-------------|
| items | array | Tak | Plan stron wyjściowych w kolejności wyjściowej. Każdy element to `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indeksuje przesłane pliki w kolejności przesyłania (od 0); `page` to numer strony (od 1) w tym dokumencie. |
| pageCounts | array | Tak | Rzeczywista liczba stron każdego przesłanego dokumentu, w tej samej kolejności. Strona planu wykraczająca poza liczbę stron dokumentu jest odrzucana z błędem 400. |

## Przykładowe żądanie {#example-request}

Weź strony 3 i 1 pierwszego dokumentu, a następnie strony 1 i 2 drugiego, obracając pierwszą stronę wyjściową o 90° zgodnie z ruchem wskazówek zegara:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Uwagi {#notes}

- Ta sama strona może pojawić się kilka razy w `items`, aby ją zduplikować.
- Strony nieobecne w `items` są pomijane w wyniku.
- `rot` zapisuje nową orientację wyświetlania na skopiowanej stronie (złożoną z ewentualnym istniejącym obrotem); zawartość strony pozostaje nietknięta.
- Obrót jest stosowany dla każdej kopii wyjściowej, więc duplikaty mogą mieć różne obroty.
- Wynik to nowy, płaski dokument; zakładki źródłowe i metadane na poziomie dokumentu nie są zachowywane.
- Przetwarzanie wymaga binarki qpdf, która jest dołączona do oficjalnego obrazu Dockera.
