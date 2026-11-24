---
description: "Połącz wiele plików tekstowych lub Markdown w jeden, w wybranej kolejności."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 3501ff59e2a2
i18n_hash_version: 2
---

# Scal pliki tekstowe {#merge-text}

Połącz wiele plików tekstowych lub Markdown w jeden plik. Pliki są łączone w kolejności przesłania, więc jeśli kolejność ma znaczenie, zmień ją na liście plików przed uruchomieniem.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Przyjmuje dane formularza multipart z co najmniej dwoma plikami tekstowymi i opcjonalnym ciągiem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Co wstawić między pliki: `"blank-line"`, `"rule"` (wiersz `---`) lub `"filename-heading"` (nazwa każdego pliku jako nagłówek) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Uwagi {#notes}

- Akceptuje pliki `.txt`, `.md`, `.markdown`, `.csv` i `.log`, od 2 do 50 w jednym żądaniu.
- Każdy plik musi być tekstem UTF-8. Plik binarny lub inny niż UTF-8 zostaje odrzucony, a jego nazwa pojawia się w komunikacie o błędzie.
- Gdy wszystkie dane wejściowe mają to samo rozszerzenie, wynik je zachowuje (`merged.md`, `merged.log`). Mieszane dane wejściowe dają `merged.txt`.
- Z `filename-heading` wynik Markdown używa nagłówków `# name.md`, a wynik w zwykłym tekście używa wierszy znaczników `==> name.txt <==`.
- Puste wiersze na końcu każdego pliku są obcinane, aby separator znalazł się czysto między dokumentami. Początkowy znacznik kolejności bajtów jest pomijany.
- Pliki CSV są łączone jako zwykły tekst. Użyj [Scal pliki CSV](./merge-csvs), aby połączyć tabele z jednym wierszem nagłówka.
- Pliki e-mail `.eml` nie są jeszcze obsługiwane.
