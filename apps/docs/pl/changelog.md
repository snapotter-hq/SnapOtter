---
description: "Informacje o wydaniach i historia wersji SnapOtter. Zobacz, co nowego, co ulepszono i co naprawiono w każdym wydaniu."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: ec924e8dad7b
---

# Dziennik zmian {#changelog}

## v2.2.0 {#v2-2-0}

Wersja 2.2 to w większości utwardzanie. Osoba niebędąca administratorem, ale mająca delegowaną rolę `users:manage`, mogła przejąć instancję, a każdy punkt końcowy narzędzi okazał się pozbawiony kontroli uprawnień. Zaktualizuj, jeśli instancja obsługuje więcej niż jednego użytkownika.

Reszta to długi ogon samodzielnego hostowania: pobrania, które się rozpoczynały i nigdy nie kończyły, presety, które psuły się w chwili dodania drugiego pliku, kontenery w pętli awarii, gdy Postgres jeszcze się uruchamiał. Pojawiły się też dwa nowe narzędzia. Dokumentacja i strona internetowa są teraz przetłumaczone na 21 języków, a interfejs w końcu spełnia kontrast WCAG AA.

> [!IMPORTANT]
> Jeśli przyznałeś osobie niebędącej administratorem `users:manage` przez rolę niestandardową, ta rola mogła przejąć konta administratorów w wersjach od 2.0.0 do 2.1.0. Szczegóły w sekcji Bezpieczeństwo.

### Bezpieczeństwo {#v2-2-0-security}

- **Podniesienie uprawnień przez delegowaną rolę `users:manage` (GHSA-9xgh-95qh-2x7h).** Osoba niebędąca administratorem, mająca `users:manage` przez rolę niestandardową, mogła zresetować hasło lub usunąć konto o wyższych uprawnieniach, w tym wbudowane konto administratora, i przejąć instancję. Reset hasła i usuwanie konta weryfikują teraz uprawnienia wywołującego względem konta docelowego, więc delegowana rola nie może sięgnąć ponad swój poziom. Dotyczy wersji od 2.0.0 do 2.1.0. Zgłoszone przez 李春来 (Chunlai Li). (#616)
- **Każdy punkt końcowy narzędzi jest teraz chroniony.** Dostęp do narzędzi był wymuszany trasa po trasie, więc wszystkie 45 ręcznie napisanych tras musiały pamiętać o tym samym wywołaniu, a żadna z nich tego nie robiła. Rola bez `tools:use` nadal mogła uruchamiać image-to-pdf, erase-object, upscale czy sign-pdf. Kontrola znajduje się teraz w jednym preHandlerze powiązanym z dopasowaną trasą, więc obejmuje podścieżki i każdą trasę dodaną później. (#646)
- **Ograniczanie liczby żądań można było obejść w instalacjach Docker.** Obraz był dostarczany z `TRUST_PROXY=true`, więc adres IP klienta pochodził z nagłówka żądania, a sfałszowany nagłówek `X-Forwarded-For` omijał limit logowania. Domyślnie obowiązuje teraz lista zaufanych sieci prywatnych. (#649)
- **Zapisy ustawień są sprawdzane dla każdego ustawienia z osobna**, a nie raz przy wejściu, a import konfiguracji jest teraz transakcyjny, więc odrzucony klucz nie zostawia połowy zastosowanej konfiguracji. (#618)
- **Nazwy plików w bibliotece nie mogą wykroczyć poza katalog główny magazynu.** Spreparowana zapisana nazwa, którą złośliwy import SQLite z wersji 1.x kopiuje dosłownie, mogła posłużyć do odczytania lub usunięcia plików poza katalogiem files. Osiągalne tylko wtedy, gdy operator zaimportuje dostarczoną przez atakującego bazę SQLite z wersji 1.x, czyli przez jedyną ścieżkę pozwalającą wybrać zapisaną nazwę. Zgłoszone przez @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Anulowanie zadania wymusza sprawdzenie właściciela**, więc uwierzytelniony użytkownik nie może już anulować zadania innego użytkownika, podając jego identyfikator. Zgłoszone przez @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Ponowny audyt całego drzewa 2.0 wykrył, co wciąż było otwarte**: przechwyconą asercję SAML można było odtworzyć, wyzwanie MFA przeżywało dowolną liczbę błędnych kodów, wyszukiwanie klucza API przy każdym żądaniu było pełnym skanem tabeli, `MAX_WORKSPACE_SIZE_GB` było martwą konfiguracją, a sanitizer SVG przepuszczał adresy `javascript:` bez cudzysłowów. (#620)
- **Naprawiono dziewięć ujawnionych CVE**: fast-uri, svgo, sharp i tar pośrednio (#619), a także Pillow 12.3.0 (#517). Dekodowanie RAW na arm64 buduje teraz LibRaw 0.22.2 ze źródeł, zamiast linkować niezałataną kopię systemową. (#649)

### Nowe funkcje {#v2-2-0-new-features}

- **Rounded Crop**: maski w kształcie zaokrąglonego kwadratu i squircle w stylu iOS, z kontrolą promienia narożników. Zbudowane z myślą o favikonach i ikonach aplikacji. (#602)
- **Remove GIF Background**: usuń tło z animowanego GIF-a, WebP lub APNG klatka po klatce i odzyskaj przezroczystą animację. (#502)
- **Lasso i tryb High Quality w Object Eraser**: przeciągnij swobodną pętlę, zamiast malować każdy piksel, i opcjonalnie zainstaluj pakiet inpaintingu dyfuzyjnego dla czystszych wypełnień dużych obszarów. (#503, #566)
- **Zapisz jako nowy plik albo nadpisz.** Edycja pliku z biblioteki po cichu zastępowała oryginał. Teraz wybierasz przy każdej edycji, a domyślnie oryginał zostaje zachowany. (#564, #577)
- **Presety proporcji w Zmianie rozmiaru.** Wybierz 1:1, 4:3 lub 16:9, a oba wymiary pozostają zablokowane, bez powiększania. (#530)
- **OCR w dwóch warstwach**: szybka warstwa jest wbudowana w obraz i działa offline bez pobierania, a dokładniejsze środowisko uruchomieniowe instaluje się na żądanie. (#519)
- **Pisz gdziekolwiek, aby wyszukać.** Zacznij pisać na pulpicie lub stronie głównej, a tekst trafi do pola wyszukiwania. (#644)
- **Dokumentacja i strona internetowa w 21 językach**: strona dokumentacji, strony docelowe i dokumentacja API są teraz przetłumaczone i dołączają do interfejsu aplikacji. Nowy przewodnik po wdrożeniach o ograniczonych zasobach obejmuje Raspberry Pi i maszyny z 2 GB pamięci. (#548)
- **Czytelniejsze nazwy narzędzi**: 18 niejednoznacznych nazw uzupełnia się teraz samo, więc „Compress" stało się „Compress Image". Identyfikatory narzędzi i trasy nie zmieniły się, więc nic z zakładek nie przestanie działać. (#520)

### Ulepszenia {#v2-2-0-improvements}

- **Kontrast WCAG AA w całym interfejsie**: paletę dostrojono tak, aby żywy pomarańcz pozostał na wypełnieniach, a teksty i etykiety korzystały z dostępnych tokenów koloru tekstu; wszystkie 57 wskaźników fokusu spełniają teraz próg 3:1 dla elementów nietekstowych. (#567, #574)
- **Upscale i usuwanie tła przestają wyglądać na zawieszone**: pasek postępu przesuwa się podczas wnioskowania, zamiast zatrzymywać się na 30%, a oba narzędzia ostrzegają teraz, że host z samym procesorem jest znacznie wolniejszy. (#605, #608)
- **Komunikaty o przekroczeniu limitu czasu podają prawdziwą przyczynę** i uwzględniają hosty z samym procesorem, zamiast obwiniać przesyłanie. (#596)
- **SnapOtter czeka przy starcie na Postgres i Redis** zamiast wpadać w pętlę awarii, zarówno w Compose, jak i w obrazie all-in-one. Instalacja Proxmox LXC restartowała się 76 razy przed tą zmianą. (#537, #595)
- **Pobrania przetrwają reverse proxy**: SnapOtter prosi nginx i zgodne serwery proxy o niebuforowanie odpowiedzi z plikami, co jest najczęstszą przyczyną tego, że pobieranie w samodzielnie hostowanej instancji zaczyna się i nigdy nie kończy. (#604, #607)
- **Compress PDF trafia blisko docelowego rozmiaru** i uczciwie mówi, gdy cel jest nieosiągalny. (#522)
- **Kontrolki narzędzi na urządzeniach mobilnych pozostają dostępne**, odkąd powłoka aplikacji dopasowuje rozmiar do dynamicznego okna widoku. (#559)
- **Convert Audio udostępnia ustawienie częstotliwości próbkowania.** (#561)
- **Administratorzy mogą poluzować minimalną długość hasła**, aż do 1 w zaufanej instancji w sieci LAN. (#543)
- **MFA jest samoobsługowe**, luka w blokadzie polityki została zamknięta, a logowania OIDC lub SAML otrzymują prawdziwe wyzwanie MFA zamiast twardej blokady. (#531, #536)
- **Samo `Error: Error` podaje teraz swoją przyczynę.** Błędy kodowania Sharp, wyjścia sidecara AI, nie-JSON-owe wyjście sidecara dokumentów i błędy usuwania tła docierały wcześniej z wymazanym powodem. (#532, #534, #535, #538, #612)
- **Okno pomocy jest przetłumaczone.** Etykiety skrótów i tekst wprowadzający były na sztywno wpisane po angielsku, podczas gdy gotowe tłumaczenia leżały nieużywane we wszystkich 21 plikach językowych. (#647)

### Poprawki błędów {#v2-2-0-bug-fixes}

- **Pliki HEIC z iPhone'a były odrzucane** jako nieczytelne, zanim dotarły do dekodera, który je obsługuje. (#631)
- **Presety konwersji zawodziły przy drugim pliku**: jpg-to-pdf i pokrewne image-to-pdf, a także pdf-to-png, pdf-to-jpg i pdf-to-tiff zwracały `Tool not found`, gdy tylko przesłano dwa pliki. (#633, #643)
- **Presety konwersji PDF traciły przycisk pobierania.** (#629)
- **Ustawienie nieograniczonego limitu czasu przetwarzania nie było respektowane**, a zawieszone strumienie postępu odzyskują teraz sprawność, zamiast zostawiać interfejs w stanie oczekiwania. (#638)
- **Pobrania zawieszały się zamiast kończyć błędem**, gdy zapisany plik okazywał się krótszy niż zapisana długość. (#617)
- **Narzędzia stron PDF zawodziły na krótkich i zaszyfrowanych plikach**: Remove Pages domyślnie proponowało zakres stron, którego nie ma żaden dokument krótszy niż sześć stron, a pliki PDF chronione hasłem zawodziły w workerze w niejasny sposób. (#594)
- **PDF to Text po cichu zwracał pusty plik** dla zeskanowanych plików PDF. Teraz kieruje do OCR i zwraca tekst w UTF-8. (#603)
- **PDF to Word gubił kolorowe bloki tekstu** i rozrzucał je po stronie. (#500)
- **Object Eraser zostawiał upiorne pozostałości** i rozmywał małe obiekty na obrazach o wysokiej rozdzielczości. (#501)
- **Stabilize Video zapisywało nieodtwarzalne wyjście** bez faststart. (#593)
- **Naprawy edytora obrazów**: obrót, odbicie, zmiana rozmiaru, poziomy, krzywe, filtry i blokada warstwy. (#597)
- **Sign PDF pokazywał puste płótno** zamiast informować, dlaczego nie udało się wczytać pliku PDF. (#545)
- **Biblioteka plików zapisywała wymiary 0x0** i pomijała podglądy przesyłanych plików HEIC, RAW i PSD. (#636, #637)
- **Zainstalowanie więcej niż jednego pakietu AI** zostawiało współdzielone środowisko wirtualne z wieloma wersjami i po cichu psuło trzy narzędzia. (#649)
- **Konwersja do JXL z jakością od 1 do 4 zwracała 500**, a brakujący ffmpeg był zgłaszany jako uszkodzone przesłanie. (#649)
- **Przejściowa awaria Postgres zostawiała ukończone zadania bez opieki**: wyniki leżały na dysku, a żaden wiersz na nie nie wskazywał. Rekoncyliator przejmuje teraz tę pracę, zamiast ją porzucać. (#649)
- **Punkt końcowy Redis, który zmienił adres, blokował każdego konsumenta**, podczas gdy kontrole stanu nadal odpowiadały 200. (#649)
- **Poprawki strony i dokumentacji**: zlokalizowane linki nie gubią już fragmentów `#` ani nie zmieniają `zh-CN` na małe litery, nawigacja dokumentacji mieści się w oknie widoku na tabletach, a żadna ze stron nie wywołuje już API GitHuba z przeglądarki. (#516, #562, #570, #560)

### Uwagi dotyczące aktualizacji {#v2-2-0-upgrade-notes}

Nie ma nic do migracji, ale zmieniły się dwie domyślne wartości:

- **`TRUST_PROXY` ma teraz domyślnie wartość `loopback,linklocal,uniquelocal`** zamiast ufać każdemu hostowi. Most Docker i sieci Compose mieszczą się w tym zakresie, więc większość konfiguracji nie wymaga zmian. Jeśli twój reverse proxy łączy się ze SnapOtter z publicznego adresu, ustaw `TRUST_PROXY` jawnie, w przeciwnym razie ograniczanie liczby żądań i dzienniki audytu przypiszą każde żądanie do serwera proxy.
- **`MAX_AI_JOBS_PER_USER` ma domyślnie wartość 5** równoległych zadań AI na pojedynczym pliku na użytkownika. Wsadowe i potokowe uruchomienia AI pozostają bez limitu.

Nowe opcjonalne parametry: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (domyślnie wyłączony) i `GIF_BG_MAX_FRAMES`.

### Podziękowania {#v2-2-0-acknowledgements}

Znaczna część tego wydania zaczęła się od zgłoszenia błędu przez kogoś innego.

Kod i wkład:

- **@mvanhorn** ❤️: Przepisał komunikat o przekroczeniu limitu czasu przy usuwaniu tła na taki, który mówi, co zrobić, zamiast samego limitu czasu. (#518, #494)
- **@EuanTop** ❤️: Przywrócił akcję pobierania na stronach presetów konwersji PDF, sprawiając, że trasa synchroniczna zwraca standardowy kontrakt wyniku narzędzia. (#629, #623)
- **@harshjainnn** ❤️: Zdiagnozował pobieranie, które zaczyna się i nigdy nie kończy, i zaproponował kierunek z resetem gniazda, na którym zbudowano poprawkę. (#617, #590)

Ujawnienia bezpieczeństwa:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Prywatnie ujawnił podniesienie uprawnień przez delegowaną rolę `users:manage`, wraz z pełną analizą od źródła do ujścia i działającym łańcuchem wykorzystania. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Ujawnił uwierzytelniony IDOR przy anulowaniu zadań oraz path traversal w zapisanych nazwach plików biblioteki, osiągalny po złośliwym imporcie SQLite z wersji 1.x, z działającym dowodem koncepcji dla każdego z nich. (#599, #600)

Zgłoszenia błędów:

- **@riz467** ❤️: Prawdziwe pliki HEIC z iPhone'a odrzucane na etapie walidacji, z rozpracowaną przyczyną źródłową w zgłoszeniu. (#622)
- **@coupej** ❤️: Strony presetów PDF wiszące w nieskończoność oraz jpg-to-pdf zawodzące natychmiast po dodaniu drugiego pliku. Dwa odrębne błędy, poprawnie rozdzielone. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` udokumentowane jako bez limitu, ale ograniczone do pięciu minut. (#630)
- **@bezibaerchen** ❤️: Convert Audio ukrywał ustawienie częstotliwości próbkowania, które obiecywał jego własny opis. (#558)
- **@hell-toupee** ❤️: Dokładny pakiet OCR nie instalował się z błędem `libpaddle`. (#505)
- **@Michael1260** ❤️ i **@And-CSH** ❤️: Niezależnie potwierdzili tę awarię instalacji OCR i ustalili, że ręczne rozpakowanie działa, a instalator w aplikacji nie, co wskazało instalator jako źródło błędu. (#505)
- **@TomErnst1972** ❤️: Włączenie polityki wymagającej MFA zamykało administratorowi dostęp do własnej instancji. (#515)
- **@thokich** ❤️: Usuwanie obiektów dawało rozmyte, nieużyteczne wypełnienia, co zapoczątkowało zarówno przepisanie inpaintingu HD, jak i opcjonalny pakiet wysokiej jakości. (#141)
- **@Hennie-git** ❤️: Instalacja Proxmox LXC restartująca się 76 razy w starciu z Postgresem, który jeszcze nie przyjmował połączeń. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Na bieżąco zajął się tym zgłoszeniem i przygotował diagnozę, na której zbudowano poprawkę startu. (#537)

Prośby o funkcje i opinie:

- **@LECOQQ** ❤️: Poprosił o poluzowanie złożoności haseł w instalacji na domowym serwerze. (#136)
- **@killervette42** ❤️: Poprosił o aplikację społecznościową Unraid, obecnie opublikowaną w sklepie Unraid CA. (#96)
- **@alienatedsec** ❤️: Zwrócił uwagę, że poprawka „GPU wraca do procesora" była ukryta w zamkniętym zgłoszeniu i trudna do znalezienia, dlatego jest teraz w dokumentacji wdrożenia. (#490, #587)
- **@neilp316** ❤️: Potwierdził awarię GPU Blackwell na RTX 5060 i wyznaczył działającą ścieżkę aktualizacji do CUDA 12.8. (#120)
- **@Roiki11** ❤️: Opowiedział się za współdzielonym magazynem z odwołaniami do ścieżek zamiast przesyłania plików przez HTTP dla obliczeń AI poza maszyną. (#189)

Podziękowania także dla członków społeczności, którzy zgłosili te problemy przez Discord i e-mail, a których nazw nie zapisaliśmy: prośba o kadrowanie squircle (#602), pobieranie image-to-PDF, które zaczynało się i nigdy nie kończyło (#604, #607), narzędzie Delete Pages zawieszające się (#594), brakujący tekst arabski w pdf-to-text (#603) oraz diagnoza stojąca za fallbackiem ONNX GPU (#490).

[Pełna różnica na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 zamienia zestaw narzędzi do obrazów w pełnoprawny pakiet do manipulacji plikami: ponad 200 narzędzi w pięciu modalnościach (Image, Video, Audio, PDF i Files), przebudowany na bazie Postgres 17 i kolejki zadań opartej na Redis, z jednopoleceniowym `docker run`. To duże wydanie; przed aktualizacją z wersji 1.x przeczytaj sekcję Zmiany łamiące zgodność.

### Nowe funkcje {#new-features}

- **Cztery nowe modalności narzędzi**: Video, Audio, PDF i Files dołączają do Image, powiększając katalog do ponad 200 narzędzi.
- **Trwałe zadania w tle**: Kolejka oparta na Redis (BullMQ) uruchamia każde narzędzie jako śledzone zadanie z podglądem postępu na żywo przez SSE.
- **Tryb pojedynczego kontenera all-in-one**: Jedno `docker run` uruchamia kompletną instancję z wbudowanym Postgres i Redis.
- **Pakiety AI na żądanie**: Usuwanie tła, OCR, transkrypcja, skalowanie w górę, wykrywanie i poprawianie twarzy, gumka do obiektów, koloryzacja i renowacja zdjęć instalują się z poziomu interfejsu. Akceleracja GPU jest wykrywana osobno dla każdego frameworka.
- **Sign PDF**: Narysuj, wpisz lub prześlij podpis i umieść go w pliku PDF w przeglądarce.
- **Automate**: Wizualny kreator potoków, który łączy narzędzia w łańcuch, z dziewięcioma gotowymi szablonami.
- **83 gotowe do jednego kliknięcia ustawienia konwersji**: Dedykowane konwertery JPG na PNG, MP4 na GIF i podobne, z wyszukiwaniem rozmytym.
- **Warstwowy edytor obrazów**: Edytor napędzany przez Konva pod adresem `/editor` z pędzlami, kształtami, korektami, filtrami i krzywymi.
- **Biblioteka Files**: Zapisz dowolny wynik i użyj go ponownie jako danych wejściowych do innego narzędzia.
- Przypięte narzędzia, powiększanie i przesuwanie w obrębie płótna, 21 języków oraz możliwości dla przedsiębiorstw (OIDC/SSO, SAML, SCIM, magazyn S3, uprawnienia dla poszczególnych narzędzi, eksport dziennika audytu, śledzenie rozproszone).

### Ulepszenia {#improvements}

- Anulowanie trwającego procesu. (#137)
- Dekodowanie RAW w pełnej rozdzielczości przez LibRaw, w tym DNG. (#289)
- Wdrożenia bez uprawnień roota i z obcym UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Dokładne wykrywanie instalacji AI i wzmocniony proces instalacji. (#214, #352)
- Wzmocnienie prywatności: brak automatycznego ruchu wychodzącego do stron trzecich oraz opcjonalny tryb ścisłego offline.
- Zawsze dostępny przycisk opinii, nawet przy wyłączonej analityce.

### Poprawki błędów {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` ponownie wyłącza ograniczanie liczby żądań dla tras narzędzi. (#271)
- Naprawiono ścieżki wirtualnego środowiska AI wewnątrz obrazu Docker. (#390)
- Zgodność z sharp 0.35.2+. (#362)
- Poprawki układu edytora obrazów: linijki, zachowanie wypełnienia, panel boczny i rozmiar płótna. (#258, #259)
- Ukończono tłumaczenie na język włoski. (#231, #206, #425)
- Normalizacja dźwięku i loudnorm zachowują częstotliwość próbkowania źródła.
- Wzmocnienie ochrony przed SSRF: numeryczne dopasowywanie CIDR dla IPv6 i rozszerzone wstępne skanowanie adresów URL. (#287)
- Wygenerowane pliki PDF są oznaczane wartością SnapOtter w polu Producer.
- mediapipe instaluje się na Pythonie 3.13 i Debianie 13.

### Zmiany łamiące zgodność {#breaking-changes}

Wersja 2.0 zastępuje wbudowaną bazę danych SQLite bazą Postgres 17 i dodaje Redis 8 do obsługi kolejki zadań. Twoje dane z wersji 1.x migrują automatycznie przy pierwszym uruchomieniu, ale zmienił się układ kontenerów, więc najpierw wykonaj kopię zapasową całego woluminu `/data` (wersja 1.x uruchamia SQLite w trybie WAL, więc zatwierdzone dane zwykle znajdują się w `snapotter.db-wal`). Następnie wybierz obraz jednego kontenera (wbudowane Postgres i Redis, tylko root) albo stos Compose (aplikacja plus Postgres 17 i Redis 8). Zobacz [przewodnik migracji](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) oraz [przewodnik aktualizacji](/pl/guide/upgrading).

### Aktualizacja {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Lub za pomocą Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Pełna różnica na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nowe narzędzie HTML na Image, dostępność WCAG 2.2 AA, wzmocnienie bezpieczeństwa dzięki testom penetracyjnym oraz 5 krytycznych poprawek dla Dockera.

### Nowe funkcje {#new-features-1}

- **HTML na Image**: Przechwytuj zrzuty ekranu adresów URL lub surowego HTML jako PNG/JPEG/WebP. Przechwytywanie całych stron, niestandardowe okna widoku, tryb ciemny.
- **Konwencja sekretów Docker _FILE**: Montuj wrażliwe zmienne środowiskowe jako pliki zamiast tekstu jawnego. (#205)
- **Licencjonowanie dla przedsiębiorstw i magazyn S3**: Opcjonalny komercyjny klucz licencyjny oraz magazyn obiektów zgodny z S3.
- **Ulepszenia edytora kształtów**: Przezroczystość wypełnienia/obrysu, próbnik kolorów RGBA, style linii kreskowanych.
- **Gotowe archiwa wydań**: Pobieraj archiwa tarball z GitHub Releases dla instalacji bez Dockera (Proxmox, bare metal, LXC). (#202)

### Ulepszenia {#improvements-1}

- **Dostępność WCAG 2.2 AA**: Pomijanie nawigacji, pułapkowanie fokusu, regiony aria-live, obsługa ograniczonego ruchu, poprawne współczynniki kontrastu. (#209)
- **Responsywność na urządzeniach mobilnych**: Responsywne ustawienia, automatyczne ponowne łączenie SSE przy przełączaniu karty na urządzeniu mobilnym. (#203, #204)
- **Jakość usuwania tła**: Wygładzanie krawędzi, dekontaminacja kolorów, wybór formatu wyjściowego.
- **Tłumaczenie na język włoski**: ~145 nowych ciągów autorstwa @albanobattistella. (#206)
- **Dokumentacja API dla poszczególnych narzędzi**: 53 strony dokumentacji z parametrami, przykładami i formatami odpowiedzi.
- **Pobieranie modeli AI**: Logika ponawiania z wykładniczym odczekiwaniem dla HuggingFace. (#201)

### Poprawki błędów {#bug-fixes-1}

- Świeże kontenery Docker były całkowicie bezużyteczne (ograniczenie liczby żądań blokowało wszystkie żądania).
- Narzędzia AI do wykrywania twarzy (blur-faces, red-eye-removal, enhance-faces, passport-photo) zawodziły na wszystkich platformach.
- Pliki HEIC uszkodzone na ARM (niezgodność symboli libheif).
- Pakiety AI upscale i restore-photo nie instalowały się na ARM.
- OCR używał niewłaściwej wersji CUDA w kontenerach z GPU.
- Obejście zabezpieczenia przed SSRF przez szesnastkowe adresy IPv6 mapowane na IPv4. (Podziękowania: @tonghuaroot)
- Dekodowanie iPhone HEIC z obrazami pomocniczymi. (#183, #199)
- Błąd braku pamięci CUDA w Real-ESRGAN na kartach GPU o pojemności 8 GB. (#200)
- 6 produkcyjnych błędów Sentry i 7 błędów QA. (#208)

### Bezpieczeństwo {#security}

- Rozwiązano 10 ustaleń z testów penetracyjnych (obejście XFF, awarie na zniekształconym JSON, nieograniczone potoki, XSS w dzienniku audytu, metoda TRACE i inne). (#207)
- Zablokowano obejście SSRF przez szesnastkowy IPv6. (Podziękowania: @tonghuaroot)
- Obrazy bazowe Dockerfile przypięte przez skrót (digest).

### Aktualizacja {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Lub za pomocą Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Pełna różnica na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Wersja demonstracyjna na żywo, strony docelowe poszczególnych narzędzi oraz zestaw poprawek dopracowujących.

### Nowe funkcje {#new-features-2}

- **Wersja demonstracyjna na żywo** - [demo.snapotter.com](https://demo.snapotter.com) pozwala ludziom wypróbować SnapOtter bez instalowania czegokolwiek.
- **Strona z indeksem narzędzi** - Przeglądaj wszystkie ponad 50 narzędzi pod adresem `/tools` z wyszukiwaniem i filtrami kategorii.
- **Ponad 50 stron docelowych SEO** - Każde narzędzie ma teraz dedykowaną stronę docelową z sekcją FAQ, przypadkami użycia i tabelami porównawczymi.
- **Podgląd tła** - Suwak przed i po pokazuje szachownicę za przezroczystymi obrazami.
- **Generator silnych haseł** - Przycisk jednego kliknięcia w formularzu Dodaj członków.

### Poprawki błędów {#bug-fixes-2}

- Narzędzie informacji o HEIC/HEIF już nie zawodzi (dodano wstępne dekodowanie).
- Instalacja pakietów modeli AI wyświetla lepsze komunikaty o błędach i respektuje limity zasobów.
- Miniatury biblioteki ładują się poprawnie (brakowało nagłówków uwierzytelniania).
- Menu rozwijane już nie są przycinane w tabelach ustawień People i Teams.
- Ukryto procent porównania rozmiaru w narzędziach niezwiązanych z kompresją.
- Usunięto zduplikowany odnośnik do polityki prywatności.
- Dodano tłumaczenie na język włoski dla ustawień funkcji AI.
- Zaktualizowano przemianowane ikony Lucide (Wand2, Columns).

### Infrastruktura {#infrastructure}

- Wynik OpenSSF Scorecard wzmocniono z 4,3 do ~7,0.
- Testy CI zrównoleglono w 4 fragmenty ze zmniejszonymi zasobami testowymi.
- 41 aktualizacji zależności.

### Aktualizacja {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Lub za pomocą Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Pełna różnica na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Pięć nowych narzędzi, pełny edytor obrazów, logowanie SSO, 20 języków. Prawdopodobnie powinny to być trzy osobne wydania, ale jest jak jest.

### Nowe funkcje {#new-features-3}

- **Edytor obrazów** - Warstwy, pędzle, kształty, korekty, filtry, krzywe, skróty klawiaturowe. Działa w przeglądarce, przetwarza na Twoim sprzęcie.
- **Uwierzytelnianie OIDC / SSO** - Logowanie za pomocą Google, GitHub, Okta lub dowolnego dostawcy OpenID Connect. Ustaw kilka zmiennych środowiskowych, a Twój zespół korzysta ze swoich istniejących kont.
- **Generator memów** - 100 wbudowanych szablonów z renderowaniem tekstu przez opentype.js. Albo prześlij własny obraz.
- **Beautify** - Wrzuć zrzut ekranu, otrzymaj dopracowany obraz. Ramki urządzeń (macOS, Windows, przeglądarka), cienie, gradienty, gotowe ustawienia dla mediów społecznościowych.
- **Symulacja daltonizmu** - Podejrzyj, jak obrazy wyglądają przy protanopii, deuteranopii, tritanopii i innych zaburzeniach widzenia barw.
- **Naprawa przezroczystości PNG** - Wykrywa pliki PNG z fałszywą przezroczystością i naprawia je za pomocą matowania BiRefNet HR. Opcjonalne usuwanie znaku wodnego przez inpainting LaMa.
- **Rozszerzanie płótna AI** - Powiększaj granice obrazu z wypełnieniem AI. Trzy poziomy jakości (szybki, zrównoważony, jakościowy) zależnie od tego, ile czasu GPU chcesz poświęcić.
- **20 języków** - arabski, chiński (uproszczony/tradycyjny), czeski, niderlandzki, francuski, niemiecki, hindi, indonezyjski, włoski, japoński, koreański, polski, portugalski, rosyjski, hiszpański, tajski, turecki, ukraiński, wietnamski. Układ RTL działa dla arabskiego.
- **Import z adresu URL** - Wklejaj adresy URL do strefy upuszczania lub importuj masowo z listy. Pobieranie po stronie serwera z ochroną przed SSRF.
- **Gumka dla wielu plików** - Rysuj maski wymazywania na wielu obrazach, przetwarzaj je wszystkie jednym kliknięciem. Pociągnięcia utrzymują się osobno dla każdego obrazu.
- **Import/eksport potoków** - Zapisuj łańcuchy narzędzi jako JSON, udostępniaj je innym.
- **17 nowych formatów aparatowych RAW** przez exiftool, a także wejście QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ i APNG. Nowe kodeki wyjściowe dla BMP, ICO, JP2, QOI. Odzyskano eksport AVIF, TIFF, GIF, JXL i PSD z wcześniej utraconej gałęzi.

### Ulepszenia {#improvements-2}

- **Ulepszanie obrazu** - Zastąpiono stary potok kombinacją CLAHE + normalise + gamma. Nowy przełącznik Deep Enhance używa modelu AI dla bardziej agresywnych rezultatów.
- **Renowacja zdjęć** - Wykrywanie zarysowań przepisano z ośmiokątowym filtrowaniem Otsu. Inpainting LaMa działa teraz w natywnej rozdzielczości.
- **Egzotyczne formaty wszędzie** - OCR, image-to-PDF, generator faviconów, kompozycja, łączenie i wektoryzacja dekodują teraz HEIC, RAW, PSD.
- **Kompresja** - Zaostrzono tolerancję rozmiaru docelowego z 5% do 1%. Rozmiar docelowy jest teraz trybem domyślnym. Dodano przyciski krokowe i selektor jednostek KB/MB.
- **Porządki w Sentry** - Odfiltrowano 644 zdarzenia niewymagające działania. Prawdziwe błędy są teraz obsługiwane poprawnie.
- **Wykrywanie GPU** - Lepsza diagnostyka dla kontenerów, w których CUDA jest obecne, ale nvidia-smi nie.
- **Tryb z wyłączonym uwierzytelnianiem** - Anonimowy użytkownik jest zasiewany w bazie danych z rolą admina. Klucze API, potoki i pliki użytkownika już nie łamią się na ograniczeniach kluczy obcych.
- **Ponad 2705 nowych testów** w warstwach jednostkowej, integracyjnej i E2E.

### Poprawki błędów {#bug-fixes-3}

- Skalowanie w górę na CPU już nie przekracza limitu czasu na urządzeniach NAS i sprzęcie o małej mocy.
- Logo kodu QR już nie powoduje trwałego zniknięcia podglądu.
- Naprawiono przepełnienie kadrowania dla wysokich obrazów portretowych.
- Pliki TIFF z kanałem alfa poprawnie wymuszają wyjście PNG zamiast powodować uszkodzenie.
- Dekodowanie HDR/EXR konwertuje do 8 bitów przed CLAHE, naprawiając błędy dekodowania.
- Bufory wejściowe punktów charakterystycznych twarzy są konwertowane do PNG przed sidecarem Pythona, naprawiając awarie.
- Znajdowanie duplikatów obsługuje partie o mieszanych formatach i błędy sieciowe.
- Podgląd Beautify aktualizuje się w czasie rzeczywistym.
- Paski postępu dla łączenia i wektoryzacji.
- SVGZ obsługiwane przez SVG-to-raster.
- Naprawiono nazwy plików spoza ASCII przez nagłówek X-File-Results z kodowaniem procentowym.

### Aktualizacja {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Lub za pomocą Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Pełna różnica na GitHubie](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Ujednolicony obraz Docker z automatycznym wykrywaniem GPU. Jeden obraz obsługuje zarówno obciążenia CPU, jak i GPU. Uproszczono compose do pojedynczego pliku z rotacją logów. Wstępne pobieranie modeli obejmuje teraz weryfikację i test dymny.

---

## v1.13.0 {#v1-13-0}

Kontrola dostępu oparta na rolach (RBAC). 14 szczegółowych uprawnień, trzy wbudowane role (admin, editor, user), obsługa niestandardowych ról. Sprawdzanie uprawnień na wszystkich trasach API. Karty frontendu filtrowane według uprawnień użytkownika.

---

## v1.12.0 {#v1-12-0}

Narzędzie PDF na Image. Konwertuj strony PDF na PNG, JPEG, WebP lub TIFF z niestandardowym DPI. Ujednolicony obraz Docker z automatycznym wykrywaniem GPU.

---

## v1.11.0 {#v1-11-0}

Automatycznie generowany plik llms.txt przez vitepress-plugin-llms dla dokumentacji przyjaznej AI.

---

## v1.10.0 {#v1-10-0}

Zmiana rozmiaru z uwzględnieniem treści (seam carving) z ochroną twarzy. Zmieniaj rozmiar obrazów, zachowując ważną treść.

---

## v1.9.0 {#v1-9-0}

Narzędzie Stitch / Combine. Łącz obrazy obok siebie, jeden nad drugim lub w niestandardowej siatce.

---

## v1.8.0 {#v1-8-0}

Narzędzie Edit Metadata. Przeglądaj i edytuj metadane EXIF, IPTC i XMP z szczegółowym interfejsem usuwania/zachowywania.

---

## Starsze wydania {#older-releases}

Pełny dziennik zmian na poziomie zatwierdzeń, w tym wydania poprawkowe, znajdziesz w [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
