---
description: "Informacje o wydaniach i historia wersji SnapOtter. Zobacz, co nowego, co ulepszono i co naprawiono w każdym wydaniu."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 72df434c4478
---

# Dziennik zmian {#changelog}

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
