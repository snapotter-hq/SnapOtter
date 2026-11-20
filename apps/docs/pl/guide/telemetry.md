---
description: "Jakie anonimowe dane o użyciu zbiera SnapOtter, kiedy są wysyłane, jak działa wybór przy pierwszym uruchomieniu i jak wyłączyć analitykę produktu dla całej instancji."
i18n_source_hash: 784b2a0c06eb
i18n_provenance: machine
i18n_output_hash: 95ca394ff936
i18n_hash_version: 2
---

# Co zbiera SnapOtter {#what-snapotter-collects}

Anonymous Product Analytics ustawia dla całej instancji administrator. Nowa instancja pyta o to przy pierwszym uruchomieniu i nic nie wysyła, dopóki ktoś nie odpowie. Możesz to zmienić w dowolnej chwili w Settings > System > Privacy.

Gdy analityka jest włączona, SnapOtter wysyła do PostHog informacje o tym, jakie narzędzia i pipeline'y są uruchamiane, ile trwają, czy kończą się powodzeniem, kody błędów i liczby plików, razem z anonimowym identyfikatorem instancji, jej wersją, architekturą procesora, systemem operacyjnym, typem instalacji i informacją, czy ma GPU. Raporty o awariach trafiają do Sentry bez nazw plików, ścieżek, adresów e-mail i wartości w cudzysłowie. Nigdy nie wysyła Twoich plików, ich nazw ani ścieżek, zawartości, wyników OCR ani wyodrębnionego tekstu, metadanych obrazów ani tożsamości Twojego konta. PostHog i Sentry to jedyne dwa miejsca, do których cokolwiek jest wysyłane, a przy wyłączonej analityce nie jest wysyłane nic do żadnego z nich.

## Wybór przy pierwszym uruchomieniu {#first-run-choice}

Gdy administrator po raz pierwszy otwiera nową instancję, SnapOtter pyta: "Wysyłać anonimowe statystyki użycia i raporty o awariach? Twoje pliki nigdy nie są wysyłane." Obie odpowiedzi mają taką samą wagę i żadna nie jest wstępnie zaznaczona. Zamknięcie okna bez odpowiedzi pozostawia analitykę wyłączoną, a pytanie pojawi się ponownie przy następnej wizycie. Widzi je tylko administrator. Przy `AUTH_ENABLED=false` nie ma kont, a użytkownik lokalny działa jako administrator, więc odpowiada ten, kto otworzy aplikację. Aplikacja desktopowa pyta w ten sam sposób.

Instancja, która działała jeszcze przed pojawieniem się tego pytania, nie jest o nic pytana. Zachowuje dotychczasowe ustawienie analityki: włączoną, chyba że administrator lub `SNAPOTTER_ANALYTICS_DEFAULT=off` ją wyłączył.

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

Administratorzy: Settings > System > Privacy, wyłącz "Anonymous Product Analytics". Wysyłanie zatrzymuje się natychmiast, w całej instancji. Aby zbudować obraz, który nigdy nie może niczego wysyłać, ustaw argument budowania `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` w środowisku serwera robi to samo w czasie działania i ma pierwszeństwo przed każdą odpowiedzią zapisaną w aplikacji.

Aby odpowiedzieć na pytanie z pierwszego uruchomienia z wyprzedzeniem, dodaj `SNAPOTTER_ANALYTICS_DEFAULT=off` (lub `on`) do środowiska serwera przed jego pierwszym startem, a nikt nie zostanie zapytany. W Docker Compose umieść to w `environment:` usługi aplikacji, ponieważ ustawienie wyłącznie w `.env` nie dociera do kontenera.
