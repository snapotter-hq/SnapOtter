---
description: "Jakie anonimowe dane o użyciu zbiera SnapOtter, kiedy są wysyłane i jak wyłączyć analitykę produktową dla całej instancji."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: 8a43e309c77a
i18n_hash_version: 2
---

# Co zbiera SnapOtter {#what-snapotter-collects}

Anonimowa analityka produktowa jest domyślnie włączona i ustawiana dla całej instancji przez administratora. Wyłącz ją w Ustawienia > System > Prywatność.

## Zdarzenia, które wysyłamy (gdy włączone) {#events-we-send-when-enabled}

- tool_used: id narzędzia, status, czas trwania, kategoria, czy jest to narzędzie AI, kod błędu przy niepowodzeniu.
- pipeline_executed: liczba kroków, id narzędzi, flaga wsadu, liczba plików, czas trwania, status.
- ai_bundle_action: id pakietu, akcja, czas trwania.
- Użycie frontendu: które strony narzędzi się otwierają, dodane pliki (tylko liczby), uruchomione narzędzie, pobrania, zapisy, wyszukiwanie (tylko liczba wyników), przetwarzanie wsadowe.
- Raporty o awariach: typ błędu, oczyszczony komunikat o błędzie (z usuniętymi nazwami plików, ścieżkami, adresami e-mail i wartościami w cudzysłowach), stos źródłowy z podstawowymi nazwami plików oraz, w przypadku narzędzi AI, ślad stosu Pythona zawierający wyłącznie podstawowe nazwy plików.

## Czego nigdy nie zbieramy {#what-we-never-collect}

- Nazw ani ścieżek plików
- Zawartości plików
- Tekstu wyjściowego OCR
- Metadanych obrazów (EXIF)
- Wyodrębnionego tekstu dokumentów
- Tożsamości Twojego konta

Jak każdy serwer, PostHog widzi adres IP, z którego przychodzi każde żądanie. Nasz projekt w PostHog odrzuca go zamiast przechowywać, a własne zdarzenia serwera SnapOtter wysyłają w jego miejsce wartość zastępczą.

## Powiadomienia o aktualizacjach {#update-notices}

Gdy analityka jest włączona, serwer co kilka godzin pyta PostHog, które wydanie SnapOtter jest najnowsze, przekazując anonimowy identyfikator instancji i jej wersję. Jeśli jest nowsze wydanie, administratorzy widzą powiadomienie z linkiem do informacji o wydaniu. Zamknięte powiadomienie pozostaje ukryte do następnego wydania. Nic nie jest instalowane ani pobierane automatycznie, a przy wyłączonej analityce serwer nigdy nie pyta.

## Wyłączanie {#turning-it-off}

Administratorzy: Ustawienia > System > Prywatność, przełącz "Anonimowa analityka produktowa" na wyłączone. Zatrzymuje się natychmiast, dla całej instancji. Aby zbudować obraz, który nigdy nie może niczego wysyłać, ustaw argument budowania `SNAPOTTER_ANALYTICS=off`.

Aby uruchomić nową instancję z analityką od razu wyłączoną, dodaj `SNAPOTTER_ANALYTICS_DEFAULT=off` do środowiska serwera przed jego pierwszym uruchomieniem. W Docker Compose umieść ją w `environment:` usługi aplikacji, ponieważ ustawienie jej tylko w `.env` nie trafia do kontenera.
