---
description: "Jakie anonimowe dane o użyciu zbiera SnapOtter, kiedy są wysyłane i jak wyłączyć analitykę produktową dla całej instancji."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 5cbde8eb2737
---

# Co zbiera SnapOtter {#what-snapotter-collects}

Anonimowa analityka produktowa jest domyślnie włączona i ustawiana dla całej instancji przez administratora. Wyłącz ją w Ustawienia > System > Prywatność.

## Zdarzenia, które wysyłamy (gdy włączone) {#events-we-send-when-enabled}

- tool_used: id narzędzia, status, czas trwania, kategoria, czy jest to narzędzie AI, kod błędu przy niepowodzeniu.
- pipeline_executed: liczba kroków, id narzędzi, flaga wsadu, liczba plików, czas trwania, status.
- ai_bundle_action: id pakietu, akcja, czas trwania.
- Użycie frontendu: które strony narzędzi się otwierają, dodane pliki (tylko liczby), uruchomione narzędzie, pobrania, zapisy, wyszukiwanie (tylko liczba wyników), przetwarzanie wsadowe.
- Raporty o awariach: typ błędu i stos źródłowy zawierający wyłącznie podstawowe nazwy plików.

## Czego nigdy nie zbieramy {#what-we-never-collect}

- Nazw ani ścieżek plików
- Zawartości plików
- Tekstu wyjściowego OCR
- Metadanych obrazów (EXIF)
- Wyodrębnionego tekstu dokumentów
- Twojego adresu IP ani tożsamości konta

## Wyłączanie {#turning-it-off}

Administratorzy: Ustawienia > System > Prywatność, przełącz "Anonimowa analityka produktowa" na wyłączone. Zatrzymuje się natychmiast, dla całej instancji. Aby zbudować obraz, który nigdy nie może niczego wysyłać, ustaw argument budowania `SNAPOTTER_ANALYTICS=off`.
