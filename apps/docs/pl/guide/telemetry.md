---
description: "Jakie anonimowe dane o użyciu zbiera SnapOtter, kiedy są wysyłane, że analityka jest domyślnie włączona i jak administrator wyłącza analitykę produktu dla całej instancji."
i18n_source_hash: 22d89115c8e5
i18n_provenance: machine
i18n_output_hash: 7281c29f639c
i18n_hash_version: 2
---

# Co zbiera SnapOtter {#what-snapotter-collects}

Anonymous Product Analytics jest domyślnie włączona w każdej instancji, bez pytania przy pierwszym uruchomieniu. Administrator może ją wyłączyć dla całej instancji w Settings > System > Privacy, co zatrzymuje cały ruch analityczny do PostHog i Sentry.

Gdy analityka jest włączona, SnapOtter wysyła do PostHog informacje o tym, jakie narzędzia i pipeline'y są uruchamiane, ile trwają, czy kończą się powodzeniem, kody błędów i liczby plików, razem z anonimowym identyfikatorem instancji, jej wersją, architekturą procesora, systemem operacyjnym, typem instalacji i informacją, czy ma GPU. Raporty o awariach trafiają do Sentry bez nazw plików, ścieżek, adresów e-mail i wartości w cudzysłowie. Nigdy nie wysyła Twoich plików, ich nazw ani ścieżek, zawartości, wyników OCR ani wyodrębnionego tekstu, metadanych obrazów ani tożsamości Twojego konta. PostHog i Sentry to jedyne dwa miejsca, do których cokolwiek jest wysyłane, a przy wyłączonej analityce nie jest wysyłane nic do żadnego z nich.

## Zdarzenia, które wysyłamy (gdy włączone) {#events-we-send-when-enabled}

- tool_used: id narzędzia, status, czas trwania, kategoria, czy jest to narzędzie AI, kod błędu przy niepowodzeniu oraz nazwa kroku dla narzędzia, które zgłasza jeden etap osobno (krok analizy w Passport Photo).
- pipeline_executed: liczba kroków, id narzędzi, flaga wsadu, liczba plików, czas trwania, status.
- ai_bundle_action: id pakietu, akcja (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), czas trwania oraz, przy nieudanej instalacji, kategoria błędu ze stałej listy (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). Dane wyjściowe instalatora, ścieżki i komunikaty o błędach nigdy nie są wysyłane.
- Użycie frontendu: które strony narzędzi się otwierają, dodane pliki (tylko liczby), uruchomione narzędzie, pobrania, zapisy, wyszukiwanie (tylko liczba wyników), przetwarzanie wsadowe.
- Raporty o awariach: typ błędu, oczyszczony komunikat o błędzie (z usuniętymi nazwami plików, ścieżkami, adresami e-mail i wartościami w cudzysłowach), stos źródłowy z podstawowymi nazwami plików oraz, w przypadku narzędzi AI, ślad stosu Pythona zawierający wyłącznie podstawowe nazwy plików.

## Czego nigdy nie zbieramy {#what-we-never-collect}

- Nazw plików ani ścieżek
- Zawartości plików
- Tekstu z wyników OCR
- Metadanych obrazów (EXIF)
- Tekstu wyodrębnionego z dokumentów
- Tożsamości Twojego konta

PostHog widzi adres IP, z którego pochodzi każde żądanie, jak każdy serwer. Nasz projekt PostHog odrzuca go zamiast zapisywać, a własne zdarzenia serwera SnapOtter wysyłają w jego miejsce wartość zastępczą.

## Powiadomienia o aktualizacjach {#update-notices}

Gdy analityka jest włączona, serwer co kilka godzin pyta PostHog, które wydanie SnapOtter jest najnowsze, używając anonimowego identyfikatora instancji i jej wersji. Gdy istnieje nowsze wydanie, administratorzy widzą powiadomienie z linkiem do informacji o wydaniu. Po jego zamknięciu pozostaje ukryte do następnego wydania. Nic nie jest instalowane ani pobierane za Ciebie, a przy wyłączonej analityce serwer w ogóle nie pyta.

## Wyłączanie {#turning-it-off}

Administratorzy: Settings > System > Privacy, wyłącz "Anonymous Product Analytics". Wysyłanie zatrzymuje się natychmiast, w całej instancji, i nic więcej nie trafia do PostHog ani Sentry. Aby zbudować obraz, który nigdy nie może niczego wysyłać, ustaw argument budowania `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` w środowisku serwera robi to samo w czasie działania, bez przebudowy.

Aby uruchomić nową instancję z już wyłączoną analityką, dodaj `SNAPOTTER_ANALYTICS_DEFAULT=off` do środowiska serwera przed jego pierwszym startem. W Docker Compose umieść to w `environment:` usługi aplikacji, ponieważ ustawienie wyłącznie w `.env` nie dociera do kontenera.
