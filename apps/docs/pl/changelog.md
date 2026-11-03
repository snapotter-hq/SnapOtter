---
description: "Informacje o wydaniach i historia wersji SnapOtter. Zobacz, co nowego, ulepszonego i naprawionego w każdym wydaniu."
i18n_source_hash: 952098c65251
i18n_provenance: machine
i18n_output_hash: e60498ac698b
i18n_hash_version: 2
---

# Dziennik zmian {#changelog}

## v2.3.0 {#v2-3-0}

SnapOtter przekroczył milion pobrań obrazów z Docker Hub i GHCR oraz 3000 gwiazdek na GitHubie. To bardzo wiele samodzielnie hostowanych serwerów, więc to wydanie jest naszym podziękowaniem dla wszystkich, którzy je prowadzą.

Warto zaktualizować jak najszybciej. Wersja 2.3.0 zamyka sześć zgłoszeń bezpieczeństwa, z których jedno ma wysoką wagę. Szczegóły znajdują się w sekcji Bezpieczeństwo poniżej.

Poza poprawkami pojawiły się nowe narzędzia: edytor stron PDF Multi-Tool, gotowe ustawienia kompresji do zadanego rozmiaru jednym kliknięciem dla obrazów i plików PDF oraz układanie stron metodą przeciągnij i upuść w Organize PDF. OCR czyta teraz po arabsku, a pdf-to-text proponuje OCR, gdy trafi na zeskanowany plik PDF. SnapOtter może działać pod podścieżką, taką jak `/snapotter`, za reverse proxy. Aplikacja nie wymaga już superużytkownika Postgres do działania. Administratorzy, którzy zostali zablokowani, mogą odzyskać dostęp z wiersza poleceń. Reszta to około 1400 poprawek, w większości problemów zgłoszonych przez użytkowników.

> [!IMPORTANT]
> Wszystkie sześć poniższych zgłoszeń dotyczy wersji 2.2.0, a niektóre sięgają wersji 2.0.0. Jeśli instancja jest współdzielona z innymi użytkownikami lub udostępniona poza własną sieć, należy zaktualizować.

### Bezpieczeństwo {#v2-3-0-security}

- **Przesłane pliki SVG mogły pominąć sanityzację (GHSA-9c7h-xjrp-8gh3, wysoka waga).** SVG odrzucony przez dekoder obrazów był zapisywany i serwowany bez zmian zamiast być oczyszczony. Dotyczy: 2.2.0 i wcześniejszych. Zgłosił @xaferima. (#1211)
- **Strumień postępu zadania nie sprawdzał, kto o niego prosi (GHSA-ff22-w6x2-fm98, średnia waga).** Wymaga teraz zalogowania i własności zadania. Dotyczy: od 2.0.0 do 2.2.0. (#1750)
- **Linki do pobrania wyniku udostępniały także oryginalny przesłany plik (GHSA-jgv3-2jc6-f628, średnia waga).** Dotyczy: 2.2.0 i wcześniejszych. Zgłosił @emirhancatkin. (#3623)
- **Zdjęcie paszportowe i efekty tła ufały identyfikatorowi zadania dostarczonemu przez klienta (GHSA-3c8g-8v4x-qq9j, średnia waga).** Dotyczy: 2.2.0 i wcześniejszych. Zgłosił @shaoyuuuuu. (#3623)
- **Import z URL, przesyłanie i podgląd pomijały sprawdzanie uprawnień roli i klucza API (GHSA-8xxr-g2w8-7f9r, średnia waga).** Dotyczy: 2.2.0 i wcześniejszych. Zgłosił @nguyenvantiennani. (#3780, #707)
- **Wymuszanie SSO ujawniało nazwę użytkownika awaryjnego (GHSA-q6fg-vvw9-cr8r, niska waga).** Odrzucone logowanie lokalne dostaje teraz taką samą odpowiedź 401 jak każde inne nieudane logowanie. Dotyczy: od 2.0.0 do 2.2.0. (#2148)
- **Postgres nie działa już jako superużytkownik.** Aplikacja łączy się teraz rolą, która może tylko odczytywać i zapisywać dane. Migracje używają osobnego, opcjonalnego połączenia. Zobacz Uwagi dotyczące aktualizacji. (#918)
- **Załatane zależności**: dolne limity nadpisań dompurify i handlebars podniesiono do poprawionych wersji. (#4247)

### Nowe funkcje {#v2-3-0-new-features}

- **PDF Multi-Tool**: edytor stron, który zmienia kolejność, duplikuje, obraca i usuwa strony oraz pobiera strony z innych plików PDF. Końcowy plik składa serwer. (#1338)
- **Kompresja do docelowego rozmiaru jednym kliknięciem**: pięć ustawień dla obrazów (20, 50, 100, 200, 500 KB) i pięć dla PDF (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Uruchamianie SnapOtter pod podścieżką**: ustawić `BASE_PATH=/snapotter`, a ten sam obraz będzie serwowany spod niej. Linki do wyników, ciasteczka, przekierowania SSO i dokumentacja API podążają za tym ustawieniem. (#1252, #1324)
- **OCR dla arabskiego**: arabski można wybrać jawnie lub pozwolić trybowi automatycznemu go wykryć. Działa dla OCR obrazów i PDF. (#4130, #4183)
- **pdf-to-text proponuje OCR**, gdy plik PDF lub cała partia nie ma warstwy tekstowej, zamiast zwracać pusty plik. (#4142, #4198)
- **Układanie stron w Organize PDF metodą przeciągnij i upuść**, myszą i dotykiem. (#1249, #2601)
- **Zmiana kolejności plików przed uruchomieniem na wielu plikach**: merge, stitch, collage i inne narzędzia wieloplikowe zachowują ustawioną kolejność. (#756, #757)
- **Anulowanie przebiegów wsadowych i potoków**, a praca faktycznie zatrzymuje się na serwerze. (#807)
- **Polecenia odzyskiwania `snapotter-admin`**: `reset-password`, `create-admin`, `unlock-user` oraz reset MFA, dla administratorów zablokowanych w interfejsie webowym. (#4016)
- **Rejestracja MFA przy logowaniu**: gdy MFA jest wymagane, użytkownicy bez niego konfigurują je na miejscu zamiast zostać zablokowani.
- **Przechwytywanie z aparatu i aplikacja do zainstalowania**: zdjęcie można zrobić prosto do narzędzia na urządzeniu mobilnym, a SnapOtter można zainstalować jako PWA. (#773)
- **Przezroczyste wypełnienie w oknie Canvas Size edytora.** (#4111)
- **Powiadomienia o aktualizacjach dla administratorów**: gdy dostępna jest nowsza wersja SnapOtter, administratorzy widzą powiadomienie, które można zamknąć, z linkiem do informacji o wydaniu. Sprawdzanie odbywa się przez istniejące połączenie analityczne, więc przy wyłączonej analityce jest wyłączone.

### Ulepszenia {#v2-3-0-improvements}

- **Usuwanie tła jest szybsze przy kolejnych uruchomieniach**: model pozostaje załadowany między żądaniami zamiast ładować się za każdym razem. (#4144)
- **Przesyłanie wsadowe zużywa znacznie mniej pamięci**: każdy plik trafia na dysk roboczy i jest przetwarzany pojedynczo, zamiast zalegać w RAM. (#2687)
- **Instalacje pakietów AI kończą się błędem w czysty sposób i są cofane**, zamiast zostawiać do połowy zainstalowane środowisko venv. Instalacje usuwania tła w Proxmox LXC znów działają, a hosty z małą ilością pamięci dostają rozsądne limity CPU przed startem zadania. (#2628, #2597, #2526, #2546)
- **Wykrywanie GPU jest bardziej niezawodne**: CUDA jest wykrywane przez sterownik, karty serii RTX 50 przechodzą na CPU zamiast zawodzić, a sprzętowe kodery wideo są testowane przed użyciem. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` teraz działa**. Było parsowane, ale nigdy nie stosowane. (#3249)
- **Długie narzędzia dostają długi limit czasu**: pdf-to-word, compress-pdf, convert-document i content-aware resize nie przekraczają już czasu zbyt wcześnie na dużych plikach. (#3276)
- **Compress PDF zachowuje czytelność skanów** i informuje, gdy nie da się osiągnąć docelowego rozmiaru, zamiast tworzyć nieczytelny plik. (#4112)
- **Nieudane logowania są ograniczane dla każdej nazwy użytkownika**: więcej niż dziesięć w piętnaście minut daje odpowiedź 429 z `Retry-After`. (#827)
- **Błędy mówią, co poszło nie tak**: brakujące pliki wykonywalne, awarie magazynu, zabicia przez brak pamięci i limity przesyłania dostają teraz konkretne komunikaty zamiast gołego 500 lub 422.
- **Dziennik audytu obejmuje uruchomienia narzędzi, wsadów i potoków**, a zdarzenia użytkowników, ról, zespołów i RODO rejestrują, kto co zrobił komu. (#3991, #3984)
- **Kontener all-in-one zatrzymuje się po nieudanym pierwszym rozruchu** zamiast restartować się w nieskończoność, a wbudowane Postgres i Redis mają terminy uruchomienia. (#3008, #1130)
- **Daty i liczby mnogie podążają za językiem użytkownika**, a ostatnie zakodowane na stałe angielskie teksty są przetłumaczone.
- **Dopracowanie wersji mobilnej i edytora**: układy suwaka, Sign PDF i kadrowania na telefonach, przeciąganie dotykiem, szybsze pędzle pikselowe oraz Levels i Curves w cofaniu i autozapisie.

### Poprawki błędów {#v2-3-0-bug-fixes}

- **Adjust Colors błędnie łączył ustawienia**: temperatura, nasycenie, odcień, kontrast i sepia nadpisywały się nawzajem zamiast się kumulować. (#3153, #3120, #3469)
- **Pixelate nie pikselizował**, a wyjście PNG było po cichu redukowane do palety w narzędziach obrazów. (#709, #716)
- **Animowane GIF i WebP traciły klatki** w kilku narzędziach, a palety GIF i przezroczystość wychodziły błędnie. (#1184, #1225, #3407, #2573)
- **Obrócone pliki traciły jakość**: auto-orient gubił kodowanie bezstratne, przezroczystość i 16-bitową głębię. Animowany WebP obraca teraz każdą klatkę. (#2384, #2529)
- **Pliki TIFF z przezroczystością, pliki AV1 HEIF i kilka formatów RAW** zawodziły lub traciły kanał alfa. (#2609, #2572, #1120)
- **Zmiana rozmiaru płótna edytora skalowała obraz** zamiast dodawać miejsce wokół niego. (#2081)
- **Nazwy plików wyjściowych były zniekształcane**: `.jpeg` i `.tif` zamieniały się w coś innego, a pliki zaczynające się od kropki lub nazwy powtarzające swoje rozszerzenie nie działały. (#3495, #3382)
- **Autozapis do biblioteki ignorował limit miejsca**, a liczniki miejsca mogły spaść poniżej zera. (#2389, #2585)
- **Zadania zawieszone po restarcie** są teraz rozstrzygane przy uruchomieniu zamiast wiecznie pokazywać "processing". (#3219, #3193)
- **Logowanie OIDC nadawało każdemu nowemu użytkownikowi nazwę "admin"**, a logowania w iOS Safari kończyły się stroną błędu po udanym zalogowaniu. (#862, #4021)
- **Wyłączone zasady haseł były nadal egzekwowane** przy tworzeniu użytkowników. (#1028)
- **Uszkodzone pliki PDF zawieszały się na 30 sekund** przed błędem. (#920)
- **Sprawdzanie miejsca na dysku dla pakietów AI żądało około 18 GB** na instalację jednego pakietu. (#1248)
- **Compress Video zawodziło dla nagrań ekranu o zmiennej liczbie klatek na sekundę.** (#2427)
- **Wsadowe usuwanie tła traciło gotowe wyniki**, gdy przeglądarka ponawiała żądanie. (#2015)
- **Pól liczbowych w ustawieniach nie dało się wyczyścić** podczas pisania. (#1449)
- **Wyłączenie analityki pozostawiało zakolejkowane zdarzenia do wysłania** około 30 sekund później. Teraz są odrzucane po rezygnacji. (#4270)

### Uwagi dotyczące aktualizacji {#v2-3-0-upgrade-notes}

Migracje uruchamiają się same przy starcie. Nie trzeba uruchamiać żadnego SQL.

- **Role bazy danych.** Kanoniczny plik Compose daje teraz aplikacji rolę, która może tylko odczytywać i zapisywać dane (`DATABASE_URL`), oraz osobne połączenie uprzywilejowane (`DATABASE_MIGRATION_URL`), używane wyłącznie przy rozruchu do migracji i nadawania uprawnień. Istniejący plik Compose działa jak dotąd: pozostawić `DATABASE_MIGRATION_URL` nieustawione, a SnapOtter działa z jedną rolą. Dla wdrożenia nielokalnego ustawić `POSTGRES_APP_PASSWORD` obok `POSTGRES_PASSWORD`.
- **Bardziej rygorystyczne kontrole przy starcie.** Wcześniej zawodziły później lub po cichu. Teraz zatrzymują kontener z komunikatem wskazującym zmienną: nieobsługiwane `DEFAULT_LOCALE` (użyć obsługiwanego kodu, takiego jak `de`, a nie `de_DE`), błędnie sformatowane `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` lub `OIDC_ISSUER_URL` przy włączonym SSO, nieprawidłowa lista `TRUST_PROXY`, błędne `BASE_PATH` oraz niezapisywalne `LOG_DIR`.
- **`TRUST_PROXY` nie przyjmuje już liczby przeskoków.** Liczba taka jak `TRUST_PROXY=2` zatrzymuje teraz kontener przy starcie zamiast po cichu nie ufać żadnemu proxy. Ustawić adresy proxy lub nazwane zakresy (domyślnie `loopback,linklocal,uniquelocal`), `false`, gdy nic nie pośredniczy przed SnapOtter, lub `true` tylko wtedy, gdy kontrolowane przez użytkownika proxy stoi przed aplikacją pod publicznym adresem. (#998)
- **`MAX_WORKER_THREADS` teraz działa.** Jeśli było ustawione i nie widać było zmiany, teraz będzie widoczna.
- **Kody statusu API.** Awarie silnika i magazynu zwracają 503 `ENGINE_UNAVAILABLE` (endpointy wsadowe zwracały 422). Przesłania ponad limit zwracają 413 (było 400). Źle sformatowane `clientJobId` zwraca 400, a ponownie użyte 409 (było 500). Odtworzenie własnego wsadu potoku zwraca 202. `mode=targetSize` bez `targetSizeKb` zwraca 400. Odrzucone logowanie lokalne przy wymuszeniu SSO zwraca 401 zamiast 403 `SSO_ENFORCED`. Ograniczone logowania zwracają 429 `LOGIN_THROTTLED`. Wynik remove-background nie zawiera już `originalUrl`.
- **Nowe opcjonalne zmienne**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (domyślnie 15 minut, `0` wyłącza), `EMBEDDED_REDIS_TIMEOUT_S` (180) oraz `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Pliki Compose są dołączone do wydania.** `docker-compose.yml` i `docker-compose-gpu.yml` są załączone do tego wydania, więc można je pobrać prosto ze strony wydania.

### Podziękowania {#v2-3-0-acknowledgements}

Milion pobrań oznacza wiele osób zgłaszających błędy, wysyłających poprawki i mówiących nam, czego brakuje. To wydanie jest w większości ich dziełem.

Kod i wkład:

- **@zakka258** ❤️: Zbudował edytor stron PDF Multi-Tool i wdrożenie pod podścieżką, dwie z największych funkcji tego wydania, wraz z testami uwierzytelniania i SSO pod podścieżką. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Zbudował gotowe ustawienia kompresji obrazów do zadanego rozmiaru jednym kliknięciem, naprawił współbieżność i czyszczenie podglądów oraz sprawił, że zablokowana pamięć przeglądarki nie zawiesza już wskaźnika logowania. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Dodał układanie stron w Organize PDF metodą przeciągnij i upuść, o co wcześniej poprosił w Discussions. (#1249, #965)
- **@drakeo338** ❤️: Dziesięć poprawek w całym stosie, w tym zachowywanie formatu i jakości przez auto-orient, grupy SCIM tworzone w jednej transakcji, instalacje AI pod cgroup v2 oraz błędy 5xx niemaskowane już jako 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Dodał przezroczyste wypełnienie płótna w edytorze, naprawił nieaktualne werdykty rozmiaru docelowego w Compress PDF i umożliwił częściowe aktualizacje zespołów. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Zatrzymał wysyłanie danych heatmap przez samodzielnie hostowane instancje, zwalidował `TRUST_PROXY` przy starcie zamiast zawieszać aplikację oraz naprawił obsługę nazw grup SCIM i limitu czasu qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Zamienił kilka błędów 500 w poprawne odpowiedzi 400 i 409 dla źle sformatowanych identyfikatorów zadań i importów multipart oraz naprawił czyszczenie pól liczbowych w Settings. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Sprawił, że odczyt kodów kreskowych działa offline dzięki dołączeniu dekodera, naprawił podglądy multimediów pokazujące wejście i ulepszył wyszukiwanie formatów. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Zgłosił i naprawił błąd Compress Video przy nagraniach ekranu o zmiennej liczbie klatek na sekundę. (#2426, #2427)
- **@dvd233** ❤️: Udostępnił wszystkie formaty RAW aparatów obsługiwane przez dekoder oraz sprawił, że narzędzia favicon pojawiają się przy wyszukiwaniu ICO. (#1120, #1121)
- **@bercedev** ❤️: Naprawił nazwy plików, których rdzeń powtarza rozszerzenie, i sprawił, że AI raportuje urządzenie, na którym faktycznie działa. (#3382, #3613)
- **@pamod-madubashana** ❤️: Przetłumaczył ostatni angielski nagłówek MFA i podłączył nieużywane teksty postępu. (#1228, #1227)
- **@mvanhorn** ❤️: Naprawił duplikowanie przydziału nazw użytkowników przy logowaniu SAML. (#2640)
- **@peremunoz** ❤️: Zatrzymał ukrywanie przez generowanie kodów kreskowych błędów magazynu i pamięci jako "Invalid text". (#4057)
- **@mayuriphad** ❤️: Naprawił awarię przy źle sformatowanym zapisanym nagłówku uwierzytelniania alertu. (#3080)
- **@DevShoaib78** ❤️: Naprawił zamykanie lassa wielokątnego w edytorze. (#1207)
- **@dltsum** ❤️: Przeniósł wyświetlanie postępu do wspólnego katalogu komunikatów. (#1262)
- **@albanobattistella** ❤️: Poprawki tłumaczeń. (#1024)
- **@shoaibyazdani** ❤️: Wygenerował ponownie wzorce wizualne macOS. (#2475)

Zgłoszenia dotyczące bezpieczeństwa:

- **@xaferima** ❤️: Odkrył, że pliki SVG odrzucone przez dekoder pomijały sanityzację, i razem z nami przeanalizował skutki. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Odkrył, że linki do wyników udostępniały także oryginalny przesłany plik. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Odkrył, że zdjęcie paszportowe i efekty tła ufały identyfikatorowi zadania dostarczonemu przez klienta. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Odkrył, że import z URL pomijał sprawdzanie uprawnień. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Zgłosił obejścia kontroli adresów SSRF przez IPv6, z działającymi dowodami koncepcji. Poprawki trafiły do wersji 2.0.0, a to podziękowanie jest spóźnione. (#287)

Zgłoszenia błędów:

- **@kabo** ❤️: Przykładowy `docker-compose.yml` nie działał. (#1027)
- **@xromen** ❤️: Uszkodzone pliki PDF zawieszające się do 30-sekundowego limitu czasu qpdf. (#920)
- **@snmabaur** ❤️: Logowanie OIDC ustawiające każdej nazwie profilu "admin". (#862)
- **@CodecNomad** ❤️: Narzędzie Blur duplikujące obraz. (#829)
- **@ohora0923** ❤️ i **@Alexis-VS-CSharp** ❤️: Niedziałający Pixelate. (#678, #775)
- **@mptpro** ❤️: Nieudane pobieranie AI do usuwania tła. (#714)
- **@dominic427** ❤️: Zmiana rozmiaru płótna edytora skalująca obraz zamiast go rozszerzać. (#2016)
- **@CodeByToast** ❤️: Pola liczbowe w Settings, których nie dało się wyczyścić. (#1186)
- **@gioxx** ❤️: Sprawdzanie miejsca na dysku dla pakietów AI żądające około 18 GB dla jednego pakietu. (#1248)
- **@rekcodocker** ❤️ i **@madmike970** ❤️: Nieudane instalacje pakietów AI w Proxmox LXC, wraz ze szczegółami kontenera, które pomogły ustalić przyczynę. (#1030, #352)
- **@wxf26054** ❤️: Wyłączone zasady haseł nadal egzekwowane przy tworzeniu użytkowników. (#1028)
- **@ersil** ❤️: iOS Safari dwukrotnie żądający wywołania zwrotnego OIDC i lądujący na stronie błędu po udanym zalogowaniu. (#4021)
- **@casi-3** ❤️: Wsadowe usuwanie tła tracące gotowe wyniki, gdy przeglądarka powtarzała żądanie, wraz z precyzyjną diagnozą. (#2015)
- **@killervette42** ❤️: Awaria GPU Blackwell w unRaid, która doprowadziła do przejścia serii RTX 50 na CPU. (#120, #4075)

Prośby o funkcje i opinie:

- **@photoevents** ❤️: Zmierzył, że usuwanie tła spędzało około 11 sekund na ładowaniu modelu i 1 sekundę na wnioskowaniu, zaproponował buforowanie sesji i podzielił się tym, czego nauczył się, prowadząc własny cache. Z tego powstał cache sesji w tym wydaniu. (#768, #776, #4144)
- **@benbou8231** ❤️: Zauważył, że zaimportowane pliki trafiają w odwrotnej kolejności do narzędzi wieloplikowych, co doprowadziło do zmiany kolejności przed uruchomieniem. (#729, #756)
- **@cf3901646** ❤️: Prześledził uciążliwy błąd produkcyjny do klasy błędów Postgres 58 i zaproponował poprawkę. Nie mogliśmy zmergować ich PR bez podpisanego CLA, więc napisaliśmy tę samą poprawkę sami. (#4210, #4253)
- **@chiliec** ❤️: Zauważył, że nieudany auto-orient był połykany po cichu, a postęp instalacji ignorował katalog tłumaczeń. Obie propozycje trafiły do wydania przez PR-y opiekunów. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Zaproponował single-flight dla importu modułu enterprise, czyli poprawkę dla równoczesnych żądań SCIM niezgodnych co do licencji. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Zwrócił uwagę, że przewodnik konfiguracji nigdy nie wspominał o nadpisaniach plików wykonywalnych silników ani o `SNAPOTTER_HW_ACCEL`, które są teraz udokumentowane. (#1312, #1696)
- **@aron-intframe** ❤️: Odtworzył lukę w obsłudze błędów exiftool na świeżym klonie i odkrył, że wyścig o ścieżkę tymczasową był gorszy, niż opisano w zgłoszeniu. (#3458)

Dziękujemy także członkom społeczności, którzy zgłaszali te sprawy przez Discord i e-mail, a których nazwisk nie zapisaliśmy.

[Pełny diff na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Większość wersji 2.2 to utwardzanie. Użytkownik niebędący administratorem z delegowaną rolą `users:manage` mógł przejąć instancję, a w każdym endpoincie narzędzia brakowało sprawdzenia uprawnień. Warto zaktualizować, jeśli instancję używa więcej niż jedna osoba.

Reszta to długi ogon samodzielnego hostingu: pobrania, które się zaczynały i nigdy nie kończyły, presety, które psuły się po dodaniu drugiego pliku, kontenery wpadające w pętlę awarii, gdy Postgres jeszcze się uruchamiał. Pojawiły się też dwa nowe narzędzia. Dokumentacja i strona są teraz przetłumaczone na 21 języków, a interfejs w końcu spełnia kontrast WCAG AA.

> [!IMPORTANT]
> Jeśli `users:manage` zostało przyznane użytkownikowi niebędącemu administratorem przez rolę niestandardową, ta rola mogła przejąć konta administratorów w wersjach od 2.0.0 do 2.1.0. Szczegóły w sekcji Bezpieczeństwo.

### Bezpieczeństwo {#v2-2-0-security}

- **Eskalacja uprawnień przez delegowaną rolę `users:manage` (GHSA-9xgh-95qh-2x7h).** Użytkownik niebędący administratorem, który miał `users:manage` przez rolę niestandardową, mógł zresetować hasło lub usunąć konto o wyższych uprawnieniach, w tym wbudowanego administratora, i przejąć instancję. Reset hasła i usunięcie konta sprawdzają teraz uprawnienia wywołującego wobec celu, więc rola delegowana nie sięgnie ponad własny poziom. Dotyczy: od 2.0.0 do 2.1.0. Zgłosił 李春来 (Chunlai Li). (#616)
- **Każdy endpoint narzędzia jest teraz chroniony.** Dostęp do narzędzi był egzekwowany osobno dla każdej trasy, więc wszystkie 45 ręcznie napisanych tras musiało pamiętać o tym samym wywołaniu i żadna tego nie robiła. Rola bez `tools:use` nadal mogła uruchamiać image-to-pdf, erase-object, upscale, sign-pdf i resztę. Kontrola znajduje się teraz w jednym preHandler opartym na dopasowanej trasie, więc obejmuje podścieżki i każdą trasę dodaną w przyszłości. (#646)
- **Ograniczanie liczby żądań dało się obejść w instalacjach Docker.** Obraz miał ustawione `TRUST_PROXY=true`, więc adres IP klienta pochodził z nagłówka żądania, a sfałszowany `X-Forwarded-For` omijał limiter logowania. Domyślnie jest teraz lista zaufania dla sieci prywatnych. (#649)
- **Zapisy ustawień są sprawdzane dla każdego ustawienia z osobna**, a nie raz przy wejściu, a import konfiguracji jest teraz transakcyjny, więc odrzucony klucz nie może zostawić częściowo zastosowanej konfiguracji. (#618)
- **Nazwy plików w bibliotece nie mogą wyjść poza katalog główny przechowywania.** Spreparowana zapisana nazwa, którą złośliwy import SQLite z wersji 1.x kopiuje dosłownie, mogła odczytać lub usunąć pliki poza katalogiem plików. Osiągalne dopiero po zaimportowaniu przez operatora bazy SQLite 1.x dostarczonej przez atakującego, co jest jedyną ścieżką pozwalającą wybrać zapisaną nazwę. Zgłosił @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Anulowanie zadań egzekwuje własność**, więc uwierzytelniony użytkownik nie może już anulować cudzego zadania po jego identyfikatorze. Zgłosił @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Ponowny audyt całego drzewa 2.0 wychwycił to, co nadal było otwarte**: przechwyconą asercję SAML dało się odtworzyć, wyzwanie MFA przetrwało dowolną liczbę błędnych kodów, wyszukiwanie klucza API przy każdym żądaniu było pełnym skanem tabeli, `MAX_WORKSPACE_SIZE_GB` było martwą konfiguracją, a sanityzator SVG przepuszczał odwołania href `javascript:` bez cudzysłowów. (#620)
- **Załatano dziewięć ujawnionych CVE**: fast-uri, svgo, sharp i tar tranzytywnie (#619) oraz Pillow 12.3.0 (#517). Dekodowanie RAW na arm64 buduje teraz LibRaw 0.22.2 ze źródeł zamiast linkować niezałataną kopię systemową. (#649)

### Nowe funkcje {#v2-2-0-new-features}

- **Rounded Crop**: maski zaokrąglonego kwadratu i squircle w stylu iOS, z regulacją promienia narożników. Stworzone z myślą o favikonach i ikonach aplikacji. (#602)
- **Remove GIF Background**: usuwa tło z animowanego GIF, WebP lub APNG klatka po klatce i zwraca animację z przezroczystością. (#502)
- **Lasso i tryb High Quality w Object Eraser**: przeciągnięcie dowolnej pętli zamiast malowania każdego piksela oraz opcjonalna instalacja pakietu inpaintingu dyfuzyjnego dla czystszych wypełnień dużych obszarów. (#503, #566)
- **Zapisz jako nowy lub nadpisz.** Edycja pliku z biblioteki po cichu zastępowała oryginał. Teraz wybiera się to przy każdej edycji, a domyślnie oryginał jest zachowywany. (#564, #577)
- **Presety proporcji w Resize.** Wybór 1:1, 4:3 lub 16:9 blokuje oba wymiary, bez powiększania. (#530)
- **Dwupoziomowy OCR**: szybki poziom jest wbudowany w obraz i działa offline bez pobierania, a dokładniejszy silnik instaluje się na żądanie. (#519)
- **Pisz gdziekolwiek, aby szukać.** Rozpoczęcie pisania na pulpicie lub stronie głównej trafia do pola wyszukiwania. (#644)
- **Dokumentacja i strona w 21 językach**: strona dokumentacji, strony landing i dokumentacja API są teraz przetłumaczone, dołączając do interfejsu aplikacji. Nowy przewodnik wdrożenia przy niskich zasobach obejmuje Raspberry Pi i maszyny z 2 GB. (#548)
- **Wyraźniejsze nazwy narzędzi**: 18 niejednoznacznych nazw samo się dookreśla, więc "Compress" stało się "Compress Image". Identyfikatory i trasy narzędzi się nie zmieniły, więc nic zapisanego w zakładkach nie przestanie działać. (#520)

### Ulepszenia {#v2-2-0-improvements}

- **Kontrast WCAG AA w całym interfejsie**: paleta została dostrojona tak, że intensywny pomarańcz zostaje na wypełnieniach, a tekst i etykiety używają dostępnych tokenów koloru, i wszystkie 57 wskaźników fokusu spełnia próg 3:1 dla elementów nietekstowych. (#567, #574)
- **Upscale i usuwanie tła nie wyglądają już na zawieszone**: pasek postępu przesuwa się w trakcie wnioskowania zamiast stać na 30%, a oba narzędzia ostrzegają teraz, że host tylko z CPU jest znacznie wolniejszy. (#605, #608)
- **Komunikaty o przekroczeniu czasu nazywają prawdziwą przyczynę** i uwzględniają hosty tylko z CPU zamiast obwiniać przesłany plik. (#596)
- **SnapOtter czeka na Postgres i Redis przy starcie** zamiast wpadać w pętlę awarii, zarówno w Compose, jak i w obrazie all-in-one. Instalacja w Proxmox LXC restartowała się wcześniej 76 razy. (#537, #595)
- **Pobrania przeżywają reverse proxy**: SnapOtter prosi nginx i zgodne proxy, aby nie buforowały odpowiedzi z plikami, co jest zwykłą przyczyną pobrań w samodzielnie hostowanych instalacjach, które się zaczynają i nigdy nie kończą. (#604, #607)
- **Compress PDF ląduje blisko docelowego rozmiaru** i uczciwie informuje, gdy cel jest poza zasięgiem. (#522)
- **Elementy sterujące narzędzi na urządzeniach mobilnych pozostają osiągalne**, ponieważ powłoki aplikacji dopasowują się teraz do dynamicznego viewportu. (#559)
- **Convert Audio udostępnia ustawienie częstotliwości próbkowania.** (#561)
- **Administratorzy mogą złagodzić minimalną długość hasła**, aż do 1 dla zaufanej instancji w sieci LAN. (#543)
- **MFA jest samoobsługowe**, blokada przez politykę została zlikwidowana, a logowania OIDC i SAML dostają prawdziwe wyzwanie MFA zamiast twardej blokady. (#531, #536)
- **Goły `Error: Error` nazywa teraz swoją przyczynę.** Błędy kodowania Sharp, zakończenia sidecara AI, niebędące JSON wyjście sidecara dokumentów i awarie usuwania tła docierały wcześniej bez powodu. (#532, #534, #535, #538, #612)
- **Okno pomocy jest przetłumaczone.** Etykiety skrótów i tekst na start były zakodowane na stałe po angielsku, podczas gdy gotowe tłumaczenia leżały nieużywane we wszystkich 21 plikach języków. (#647)

### Poprawki błędów {#v2-2-0-bug-fixes}

- **Pliki HEIC z iPhone'a były odrzucane** jako nieczytelne, zanim dotarły do dekodera, który je obsługuje. (#631)
- **Presety konwersji zawodziły przy drugim pliku**: jpg-to-pdf i pokrewne image-to-pdf, a także pdf-to-png, pdf-to-jpg i pdf-to-tiff zwracały `Tool not found` po przesłaniu dwóch plików. (#633, #643)
- **Presety konwersji PDF traciły przycisk pobierania.** (#629)
- **Nieograniczony limit czasu przetwarzania nie był respektowany**, a zablokowane strumienie postępu odzyskują się teraz zamiast zostawiać interfejs w oczekiwaniu. (#638)
- **Pobrania zawieszały się zamiast kończyć błędem**, gdy zapisany plik okazywał się krótszy niż jego zapisana długość. (#617)
- **Narzędzia stron PDF zawodziły dla krótkich i zaszyfrowanych plików**: Remove Pages domyślnie używało zakresu stron, którego nie ma żaden dokument poniżej sześciu stron, a pliki PDF chronione hasłem zawodziły w tajemniczy sposób wewnątrz workera. (#594)
- **PDF to Text po cichu zwracał pusty plik** dla zeskanowanych plików PDF. Teraz wskazuje OCR i serwuje tekst w UTF-8. (#603)
- **PDF to Word gubił kolorowe bloki tekstu** i rozbijał je na stronie. (#500)
- **Object Eraser zostawiał duchy** i rozmywał małe obiekty na obrazach w wysokiej rozdzielczości. (#501)
- **Stabilize Video zapisywał niemożliwe do odtworzenia wyjście** bez faststart. (#593)
- **Naprawy edytora obrazów**: obrót, odbicie, zmiana rozmiaru, levels, curves, filtry i blokada warstw. (#597)
- **Sign PDF pokazywał pusty obszar roboczy** zamiast zgłaszać, dlaczego nie udało się wczytać pliku PDF. (#545)
- **Biblioteka plików zapisywała wymiary 0x0** i pomijała podglądy dla plików HEIC, RAW i PSD. (#636, #637)
- **Instalacja więcej niż jednego pakietu AI** pozostawiała wspólne środowisko virtualenv w wielu wersjach i po cichu psuła trzy narzędzia. (#649)
- **Konwersja do JXL z jakością od 1 do 4 zwracała 500**, a brakujący ffmpeg był zgłaszany jako uszkodzony przesłany plik. (#649)
- **Przejściowa awaria Postgres osierocała ukończone zadania**, zostawiając wynik na dysku bez wiersza, który na niego wskazuje. Reconciler adoptuje teraz taką pracę zamiast ją porzucać. (#649)
- **Endpoint Redis, który zmienił adres, blokował wszystkich konsumentów**, podczas gdy kontrole stanu nadal odpowiadały 200. (#649)
- **Poprawki strony i dokumentacji**: zlokalizowane linki nie gubią już fragmentów `#` ani nie zamieniają `zh-CN` na małe litery, nawigacja dokumentacji mieści się w viewporcie na tabletach, a żadna ze stron nie wywołuje już API GitHub z przeglądarki. (#516, #562, #570, #560)

### Uwagi dotyczące aktualizacji {#v2-2-0-upgrade-notes}

Nie ma czego migrować, ale zmieniły się dwie dostarczane wartości domyślne:

- **`TRUST_PROXY` ma teraz domyślnie `loopback,linklocal,uniquelocal`** zamiast ufać każdemu węzłowi. Sieci mostkowe Docker i Compose mieszczą się w tym zakresie, więc większość konfiguracji nie wymaga zmian. Jeśli reverse proxy łączy się z SnapOtter z publicznego adresu, należy jawnie ustawić `TRUST_PROXY`, w przeciwnym razie ograniczanie liczby żądań i dzienniki audytu będą przypisywać każde żądanie do proxy.
- **`MAX_AI_JOBS_PER_USER` ma domyślnie 5** jednocześnie wykonywanych zadań AI jednego pliku na użytkownika. Uruchomienia AI wsadowe i w potokach pozostają bez limitu.

Nowe opcjonalne ustawienia: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (domyślnie wyłączone) i `GIF_BG_MAX_FRAMES`.

### Podziękowania {#v2-2-0-acknowledgements}

Spora część tego wydania zaczęła się od cudzego zgłoszenia błędu.

Kod i wkład:

- **@mvanhorn** ❤️: Przepisał błąd przekroczenia czasu usuwania tła na komunikat mówiący, co z tym zrobić, zamiast gołego przekroczenia czasu. (#518, #494)
- **@EuanTop** ❤️: Przywrócił akcję pobierania na stronach presetów konwersji PDF, sprawiając, że trasa synchroniczna zwraca standardowy kontrakt wyniku narzędzia. (#629, #623)
- **@harshjainnn** ❤️: Zdiagnozował pobranie, które się zaczyna i nigdy nie kończy, i zaproponował kierunek resetu gniazda, na którym oparto poprawkę. (#617, #590)

Zgłoszenia dotyczące bezpieczeństwa:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Prywatnie zgłosił eskalację uprawnień przez delegowaną rolę `users:manage`, z pełną analizą od źródła do ujścia i działającym łańcuchem exploita. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Zgłosił uwierzytelniony IDOR przy anulowaniu zadań oraz path traversal w zapisanych nazwach plików biblioteki, osiągalny po złośliwym imporcie SQLite z wersji 1.x, z działającym dowodem koncepcji dla każdego. (#599, #600)

Zgłoszenia błędów:

- **@riz467** ❤️: Prawdziwe pliki HEIC z iPhone'a odrzucane przy walidacji, z ustaloną w zgłoszeniu główną przyczyną. (#622)
- **@coupej** ❤️: Strony presetów PDF wiszące w nieskończoność oraz jpg-to-pdf zawodzące po dodaniu drugiego pliku. Dwa odrębne błędy, poprawnie rozdzielone. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` udokumentowane jako nieograniczone, a ograniczone do pięciu minut. (#630)
- **@bezibaerchen** ❤️: Convert Audio ukrywało ustawienie częstotliwości próbkowania, które obiecywał jego własny opis. (#558)
- **@hell-toupee** ❤️: Dokładny pakiet OCR, którego instalacja kończyła się błędem `libpaddle`. (#505)
- **@Michael1260** ❤️ i **@And-CSH** ❤️: Niezależnie potwierdzili ten błąd instalacji OCR i ustalili, że ręczne rozpakowanie działa, a instalator w aplikacji nie, co zawęziło błąd do instalatora. (#505)
- **@TomErnst1972** ❤️: Włączenie polityki wymagającej MFA blokowało administratora w jego własnej instancji. (#515)
- **@thokich** ❤️: Usuwanie obiektów dające rozmyte, bezużyteczne wypełnienia, co doprowadziło zarówno do przepisania inpaintingu HD, jak i do opcjonalnego pakietu wysokiej jakości. (#141)
- **@Hennie-git** ❤️: Instalacja w Proxmox LXC restartująca się 76 razy względem Postgres, który jeszcze nie przyjmował połączeń. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Przeprowadził triaż tego zgłoszenia na bieżąco i przygotował diagnozę, na której oparto poprawkę rozruchu. (#537)

Prośby o funkcje i opinie:

- **@LECOQQ** ❤️: Poprosił o złagodzenie złożoności haseł w instalacji na domowym serwerze. (#136)
- **@killervette42** ❤️: Poprosił o Unraid Community App, opublikowaną już w sklepie Unraid CA. (#96)
- **@alienatedsec** ❤️: Zwrócił uwagę, że poprawka przełączania GPU na CPU była ukryta w zamkniętym zgłoszeniu i nie do znalezienia, dlatego jest teraz w dokumentacji wdrożenia. (#490, #587)
- **@neilp316** ❤️: Potwierdził awarię GPU Blackwell na RTX 5060 i wskazał działającą ścieżkę aktualizacji do CUDA 12.8. (#120)
- **@Roiki11** ❤️: Argumentował za współdzielonym magazynem z odwołaniami do ścieżek zamiast transferu plików przez HTTP dla obliczeń AI poza maszyną. (#189)

Dziękujemy także członkom społeczności, którzy zgłaszali te sprawy przez Discord i e-mail, a których nazwisk nie zapisaliśmy: prośba o kadrowanie squircle (#602), pobieranie image-to-PDF, które się zaczynało i nigdy nie kończyło (#604, #607), zawieszające się narzędzie Delete Pages (#594), brak arabskiego tekstu w pdf-to-text (#603) oraz diagnoza stojąca za przejściem ONNX z GPU na CPU (#490).

[Pełny diff na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 zamienia zestaw narzędzi do obrazów w pełny pakiet do obróbki plików: ponad 200 narzędzi w pięciu modalnościach (obraz, wideo, audio, PDF i pliki), przebudowany na Postgres 17 i kolejce zadań opartej na Redis, z jednopoleceniowym `docker run`. To wydanie główne; przed aktualizacją z wersji 1.x należy przeczytać sekcję Zmiany łamiące zgodność.

### Nowe funkcje {#new-features}

- **Cztery nowe modalności narzędzi**: wideo, audio, PDF i pliki dołączają do obrazów, co daje katalog ponad 200 narzędzi.
- **Trwałe zadania w tle**: kolejka oparta na Redis (BullMQ) uruchamia każde narzędzie jako śledzone zadanie z postępem na żywo przez SSE.
- **Tryb jednego kontenera all-in-one**: jedno `docker run` uruchamia kompletną instancję z wbudowanymi Postgres i Redis.
- **Pakiety AI na żądanie**: usuwanie tła, OCR, transkrypcja, powiększanie, wykrywanie i poprawa twarzy, object eraser, koloryzacja i restauracja zdjęć instalują się z poziomu interfejsu. Przyspieszenie GPU jest wykrywane dla każdego frameworka.
- **Sign PDF**: narysować, wpisać lub wgrać podpis i umieścić go na pliku PDF w przeglądarce.
- **Automate**: wizualny kreator potoków łączący narzędzia, z dziewięcioma gotowymi szablonami.
- **83 gotowe ustawienia konwersji jednym kliknięciem**: dedykowane konwertery, takie jak JPG-to-PNG czy MP4-to-GIF, z wyszukiwaniem rozmytym.
- **Edytor obrazów oparty na warstwach**: edytor na Konva pod `/editor` z pędzlami, kształtami, korektami, filtrami i krzywymi.
- **Biblioteka plików**: zapisać dowolny wynik i użyć go jako wejścia do innego narzędzia.
- Przypięte narzędzia, powiększanie i przesuwanie na płótnie, 21 języków oraz możliwości enterprise (OIDC/SSO, SAML, SCIM, magazyn S3, uprawnienia dla poszczególnych narzędzi, eksport audytu, śledzenie rozproszone).

### Ulepszenia {#improvements}

- Anulowanie uruchomionego procesu. (#137)
- Dekodowanie RAW w pełnej rozdzielczości przez LibRaw, w tym DNG. (#289)
- Wdrożenia bez roota i z obcym UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Dokładne wykrywanie instalacji AI i utwardzony proces instalacji. (#214, #352)
- Utwardzenie prywatności: brak automatycznego ruchu wychodzącego do osób trzecich oraz opcjonalny tryb ścisłego offline.
- Zawsze dostępny przycisk opinii, nawet przy wyłączonej analityce.

### Poprawki błędów {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` znów wyłącza ograniczanie liczby żądań dla tras narzędzi. (#271)
- Naprawiono ścieżki virtualenv AI wewnątrz obrazu Docker. (#390)
- Zgodność z sharp 0.35.2+. (#362)
- Poprawki układu edytora obrazów: linijki, zachowanie wypełnienia, pasek boczny i rozmiar płótna. (#258, #259)
- Ukończono tłumaczenie na włoski. (#231, #206, #425)
- Audio normalize i loudnorm zachowują częstotliwość próbkowania źródła.
- Utwardzenie SSRF: numeryczne dopasowanie CIDR dla IPv6 i rozszerzone wstępne skanowanie URL. (#287)
- Wygenerowane pliki PDF są oznaczane SnapOtter jako Producer.
- mediapipe instaluje się na Python 3.13 i Debian 13.

### Zmiany łamiące zgodność {#breaking-changes}

Wersja 2.0 zastępuje wbudowaną bazę SQLite bazą Postgres 17 i dodaje Redis 8 dla kolejki zadań. Dane z wersji 1.x migrują się automatycznie przy pierwszym rozruchu, ale stos kontenerów się zmienił, więc najpierw należy wykonać kopię zapasową całego wolumenu `/data` (wersja 1.x uruchamia SQLite w trybie WAL, więc zatwierdzone dane zwykle znajdują się w `snapotter.db-wal`). Następnie wybrać obraz jednokontenerowy (wbudowane Postgres i Redis, tylko root) lub stos Compose (aplikacja plus Postgres 17 i Redis 8). Zobacz [przewodnik migracji](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) i [przewodnik aktualizacji](/pl/guide/upgrading).

### Aktualizacja {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Lub z Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Pełny diff na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nowe narzędzie HTML to Image, dostępność WCAG 2.2 AA, utwardzenie bezpieczeństwa po testach penetracyjnych i 5 krytycznych poprawek Docker.

### Nowe funkcje {#new-features-1}

- **HTML to Image**: przechwytywanie zrzutów ekranu z adresów URL lub surowego HTML jako PNG/JPEG/WebP. Zrzuty całej strony, niestandardowe viewporty, tryb ciemny.
- **Konwencja Docker _FILE dla sekretów**: montowanie wrażliwych zmiennych środowiskowych jako plików zamiast jawnego tekstu. (#205)
- **Licencjonowanie enterprise i magazyn S3**: opcjonalny komercyjny klucz licencyjny i magazyn obiektów zgodny z S3.
- **Ulepszenia edytora kształtów**: przezroczystość wypełnienia i obrysu, selektor kolorów RGBA, style linii przerywanych.
- **Gotowe archiwa wydań**: pobieranie tarballi z GitHub Releases dla instalacji bez Docker (Proxmox, bare metal, LXC). (#202)

### Ulepszenia {#improvements-1}

- **Dostępność WCAG 2.2 AA**: pomijanie nawigacji, pułapka fokusu, regiony aria-live, obsługa ograniczonego ruchu, poprawne współczynniki kontrastu. (#209)
- **Responsywność na urządzeniach mobilnych**: responsywne ustawienia, automatyczne ponowne połączenie SSE po przełączeniu karty na urządzeniu mobilnym. (#203, #204)
- **Jakość usuwania tła**: wygładzanie krawędzi, dekontaminacja kolorów, wybór formatu wyjściowego.
- **Tłumaczenie na włoski**: ~145 nowych tekstów od @albanobattistella. (#206)
- **Dokumentacja API dla każdego narzędzia**: 53 strony dokumentacji z parametrami, przykładami i formatami odpowiedzi.
- **Pobieranie modeli AI**: logika ponawiania z wykładniczym wycofywaniem dla HuggingFace. (#201)

### Poprawki błędów {#bug-fixes-1}

- Świeże kontenery Docker były całkowicie bezużyteczne (limit liczby żądań blokował wszystkie żądania).
- Narzędzia AI do wykrywania twarzy (blur-faces, red-eye-removal, enhance-faces, passport-photo) zawodziły na wszystkich platformach.
- Pliki HEIC nie działały na ARM (niezgodność symboli libheif).
- Pakiety AI upscale i restore-photo nie instalowały się na ARM.
- OCR używał złej wersji CUDA w kontenerach z GPU.
- Obejście zabezpieczenia SSRF przez szesnastkowe adresy IPv6 mapowane z IPv4. (Podziękowania: @tonghuaroot)
- Dekodowanie HEIC z iPhone'a z obrazami pomocniczymi. (#183, #199)
- Brak pamięci CUDA w Real-ESRGAN na GPU 8GB. (#200)
- 6 produkcyjnych błędów Sentry i 7 błędów QA. (#208)

### Bezpieczeństwo {#security}

- Usunięto 10 ustaleń z testów penetracyjnych (obejście XFF, awarie przy źle sformatowanym JSON, nieograniczone potoki, XSS w dzienniku audytu, metoda TRACE i inne). (#207)
- Zablokowano obejście SSRF przez szesnastkowe IPv6. (Podziękowania: @tonghuaroot)
- Obrazy bazowe Dockerfile przypięte według digestu.

### Aktualizacja {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Lub z Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Pełny diff na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Demo na żywo, strony docelowe dla poszczególnych narzędzi i seria poprawek dopracowujących.

### Nowe funkcje {#new-features-2}

- **Demo na żywo** - [demo.snapotter.com](https://demo.snapotter.com) pozwala wypróbować SnapOtter bez instalowania czegokolwiek.
- **Strona indeksu narzędzi** - przeglądanie wszystkich ponad 50 narzędzi pod `/tools` z wyszukiwaniem i filtrami kategorii.
- **Ponad 50 stron docelowych SEO** - każde narzędzo ma teraz dedykowaną stronę z FAQ, przypadkami użycia i tabelami porównań.
- **Podgląd tła** - suwak przed-po pokazuje szachownicę za przezroczystymi obrazami.
- **Generator silnych haseł** - przycisk jednego kliknięcia w formularzu Add Members.

### Poprawki błędów {#bug-fixes-2}

- Narzędzie info dla HEIC/HEIF nie zawodzi już (dodano wstępne dekodowanie).
- Instalacja pakietu modelu AI pokazuje lepsze komunikaty błędów i respektuje limity zasobów.
- Miniatury biblioteki ładują się poprawnie (brakowało nagłówków uwierzytelniania).
- Menu rozwijane nie są już przycinane w tabelach ustawień People i Teams.
- Procent porównania rozmiaru ukryty w narzędziach niezwiązanych z kompresją.
- Usunięto zduplikowany link do polityki prywatności.
- Dodano włoskie tłumaczenie ustawień funkcji AI.
- Zaktualizowano zmienione nazwy ikon Lucide (Wand2, Columns).

### Infrastruktura {#infrastructure}

- OpenSSF Scorecard podniesiony z 4,3 do ~7,0.
- Testy CI zrównoleglone na 4 shardy z pomniejszonymi fixture'ami.
- 41 aktualizacji zależności.

### Aktualizacja {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Lub z Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Pełny diff na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Pięć nowych narzędzi, pełny edytor obrazów, logowanie SSO, 20 języków. Pewnie powinny to być trzy osobne wydania, ale jesteśmy, gdzie jesteśmy.

### Nowe funkcje {#new-features-3}

- **Edytor obrazów** - warstwy, pędzle, kształty, korekty, filtry, krzywe, skróty klawiaturowe. Działa w przeglądarce, przetwarza na własnym sprzęcie.
- **Uwierzytelnianie OIDC / SSO** - logowanie przez Google, GitHub, Okta lub dowolnego dostawcę OpenID Connect. Wystarczy ustawić kilka zmiennych środowiskowych, a zespół używa swoich istniejących kont.
- **Generator memów** - 100 wbudowanych szablonów z renderowaniem tekstu przez opentype.js. Można też wgrać własny obraz.
- **Beautify** - wrzucić zrzut ekranu, dostać dopracowany obraz. Ramki urządzeń (macOS, Windows, przeglądarka), cienie, gradienty, presety dla mediów społecznościowych.
- **Symulacja ślepoty barw** - podgląd wyglądu obrazów przy protanopii, deuteranopii, tritanopii i innych zaburzeniach widzenia barw.
- **Naprawa przezroczystości PNG** - wykrywa pliki PNG z fałszywą przezroczystością i naprawia je za pomocą BiRefNet HR-matting. Opcjonalne usuwanie znaków wodnych przez inpainting LaMa.
- **Rozszerzanie płótna AI** - rozszerza granice obrazu z wypełnieniem AI. Trzy poziomy jakości (szybki, zrównoważony, jakościowy) zależnie od tego, ile czasu GPU chce się poświęcić.
- **20 języków** - arabski, chiński (uproszczony/tradycyjny), czeski, holenderski, francuski, niemiecki, hindi, indonezyjski, włoski, japoński, koreański, polski, portugalski, rosyjski, hiszpański, tajski, turecki, ukraiński, wietnamski. RTL działa dla arabskiego.
- **Import z URL** - wklejanie adresów URL do strefy upuszczania lub import zbiorczy z listy. Pobieranie po stronie serwera z ochroną SSRF.
- **Gumka wieloplikowa** - rysowanie masek wymazywania na wielu obrazach i przetwarzanie wszystkich jednym kliknięciem. Pociągnięcia są zachowywane dla każdego obrazu.
- **Import/eksport potoków** - zapisywanie łańcuchów narzędzi jako JSON i udostępnianie ich innym.
- **17 nowych formatów RAW aparatów** przez exiftool, a także wejście QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ i APNG. Nowe kodeki wyjściowe dla BMP, ICO, JP2, QOI. Eksport AVIF, TIFF, GIF, JXL i PSD odzyskano z wcześniej utraconej gałęzi.

### Ulepszenia {#improvements-2}

- **Poprawa obrazu** - stary potok zastąpiono CLAHE + normalizacją + gamma. Nowy przełącznik Deep Enhance używa modelu AI dla bardziej agresywnych rezultatów.
- **Restore photo** - wykrywanie rys przepisano z filtrowaniem Otsu pod 8 kątami. Inpainting LaMa działa teraz w natywnej rozdzielczości.
- **Egzotyczne formaty wszędzie** - OCR, image-to-PDF, generator favikon, kompozycja, stitch i vectorize dekodują teraz HEIC, RAW i PSD.
- **Compress** - tolerancja rozmiaru docelowego zaostrzona z 5% do 1%. Rozmiar docelowy jest trybem domyślnym. Dodano przyciski krokowe i selektor jednostek KB/MB.
- **Porządki w Sentry** - odfiltrowano 644 zdarzenia niewymagające działania. Prawdziwe błędy są teraz obsługiwane poprawnie.
- **Wykrywanie GPU** - lepsza diagnostyka dla kontenerów, w których CUDA jest obecne, a nvidia-smi nie.
- **Tryb z wyłączonym uwierzytelnianiem** - użytkownik anonimowy jest zapisany w bazie z rolą administratora. Klucze API, potoki i pliki użytkowników nie łamią się już na ograniczeniach FK.
- **Ponad 2705 nowych testów** jednostkowych, integracyjnych i E2E.

### Poprawki błędów {#bug-fixes-3}

- Upscale na CPU nie przekracza już limitu czasu na urządzeniach NAS i słabym sprzęcie.
- Logo kodu QR nie powoduje już trwałego znikania podglądu.
- Naprawiono przepełnienie kadrowania dla wysokich obrazów w orientacji pionowej.
- Pliki TIFF z kanałem alfa poprawnie wymuszają wyjście PNG zamiast powodować uszkodzenia.
- Dekodowanie HDR/EXR konwertuje do 8 bitów przed CLAHE, co naprawia błędy dekodowania.
- Bufory wejściowe punktów charakterystycznych twarzy są konwertowane do PNG przed sidecarem Python, co naprawia awarie.
- Find duplicates obsługuje partie o mieszanych formatach i błędy sieci.
- Podgląd Beautify aktualizuje się w czasie rzeczywistym.
- Paski postępu dla stitch i vectorize.
- SVGZ obsługiwany przez SVG-to-raster.
- Naprawiono nazwy plików spoza ASCII przez nagłówek X-File-Results kodowany procentowo.

### Aktualizacja {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Lub z Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Pełny diff na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Ujednolicony obraz Docker z automatycznym wykrywaniem GPU. Jeden obraz obsługuje obciążenia CPU i GPU. Uproszczono compose do jednego pliku z rotacją logów. Wstępne pobieranie modeli obejmuje teraz weryfikację i test dymny.

---

## v1.13.0 {#v1-13-0}

Kontrola dostępu oparta na rolach (RBAC). 14 szczegółowych uprawnień, trzy wbudowane role (admin, editor, user), obsługa ról niestandardowych. Kontrole uprawnień na wszystkich trasach API. Karty interfejsu filtrowane według uprawnień użytkownika.

---

## v1.12.0 {#v1-12-0}

Narzędzie PDF to Image. Konwersja stron PDF do PNG, JPEG, WebP lub TIFF przy dowolnym DPI. Ujednolicony obraz Docker z automatycznym wykrywaniem GPU.

---

## v1.11.0 {#v1-11-0}

Automatycznie generowany llms.txt przez vitepress-plugin-llms dla dokumentacji przyjaznej dla AI.

---

## v1.10.0 {#v1-10-0}

Zmiana rozmiaru z uwzględnieniem treści (seam carving) z ochroną twarzy. Zmiana rozmiaru obrazów z zachowaniem ważnej zawartości.

---

## v1.9.0 {#v1-9-0}

Narzędzie Stitch / Combine. Łączenie obrazów obok siebie, w pionie lub w niestandardowej siatce.

---

## v1.8.0 {#v1-8-0}

Narzędzie Edit Metadata. Przeglądanie i edycja metadanych EXIF, IPTC i XMP z szczegółowym interfejsem usuwania i zachowywania.

---

## Starsze wydania {#older-releases}

Pełny dziennik zmian na poziomie commitów, w tym wydania poprawkowe, znajduje się w [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
