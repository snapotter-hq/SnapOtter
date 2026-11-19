---
title: "Kody błędów"
description: "Kształt treści błędu, stabilne kody i co zrobić w przypadku każdego z nich."
i18n_source_hash: dd2420de1d32
i18n_provenance: machine
i18n_output_hash: ec9fbfc7c85a
i18n_hash_version: 2
---

# Kody błędów {#error-codes}

Każda odpowiedź JSON z błędem ma ten sam kształt:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Pole | Zawsze obecne | Znaczenie |
|-------|----------------|---------|
| `error` | Tak | Komunikat czytelny dla człowieka. Można go bezpiecznie pokazywać użytkownikom. Nie należy go parsować. |
| `code` | Tak | Stabilny kod czytelny dla maszyn. To po nim należy rozgałęziać logikę. |
| `requestId` | Tak | Identyfikator tego żądania nadany przez serwer. Należy go podać przy zgłaszaniu problemu; odpowiada wpisowi w logu serwera. |
| `details` | Czasami | Dodatkowy kontekst dla niektórych błędów 4xx, na przykład komunikat walidacji. |

Komunikaty mogą się zmieniać między wydaniami. Kody nie, dlatego logikę klienta należy opierać na `code`.

## Kody wynikające ze statusu HTTP {#status-codes}

Gdy trasa nie ustawia własnego kodu, serwer wyprowadza go ze statusu:

| Status HTTP | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Każdy inny status 4xx przechodzi na `BAD_REQUEST`, a każdy inny status 5xx na `INTERNAL_ERROR`.

Trasa może ustawić bardziej szczegółowy kod i wtedy odpowiedź zawiera właśnie ten kod. Na przykład narzędzie, którego nie można uruchomić z powodu braku pakietu AI, zwraca kod specyficzny dla funkcji. Te kody opisano przy funkcji, która je zgłasza.

## Uwierzytelnianie i dostęp {#auth-codes}

| `code` | Status | Co zrobić |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Wysłać `Authorization: Bearer <token>` z tokenem sesji lub kluczem API (`si_...`). |
| `FORBIDDEN` | 403 | Poświadczenie jest prawidłowe, ale brakuje mu uprawnienia. Należy poprosić administratora o to uprawnienie. |
| `MUST_CHANGE_PASSWORD` | 403 | Konto musi zmienić hasło, zanim będzie mogło wywoływać inne endpointy. Należy wywołać `POST /api/auth/change-password` z tokenem sesji, a następnie spróbować ponownie. |
| `USER_DISABLED` | 403 | Konto jest wyłączone. Administrator musi je ponownie włączyć. |
| `LOGIN_THROTTLED` | 429 | Zbyt wiele nieudanych prób logowania. Przed kolejną próbą należy poczekać. |
| `VALIDATION_ERROR` | 400 | Treść lub parametry żądania nie przeszły walidacji. `details` wskazuje problem. |

Konto administratora tworzone przy pierwszym uruchomieniu to `admin` z hasłem `admin`, chyba że zmieniono je przez `DEFAULT_USERNAME` lub `DEFAULT_PASSWORD`. Jeśli nie ustawiono `SKIP_MUST_CHANGE_PASSWORD`, to konto otrzymuje `MUST_CHANGE_PASSWORD` przy każdym wywołaniu, dopóki hasło nie zostanie zmienione.

## Zadania {#job-codes}

Zadanie, które się nie powiodło, zgłasza przyczynę w samym zadaniu, a nie w błędzie HTTP. Należy odczytać `error.code` i `error.message` z `GET /api/v1/jobs/{jobId}`. Zobacz [Śledzenie postępu](/pl/api/rest#progress-tracking).

Nieudane zadanie zachowuje `error.code` tylko wtedy, gdy porażka wynika z błędu danych wejściowych lub awarii serwera. Pozostałe porażki zawierają wyłącznie komunikat.

| `code` | Znaczenie | Co zrobić |
|--------|--------|------------|
| `CANCELED` | Zadanie zostało anulowane przez użytkownika. To nie jest status HTTP. Zdarzenia postępu zawierają `phase: failed` z tym kodem. | Traktować to jako anulowanie przez użytkownika. Nie ponawiać automatycznie. |
| `INPUT_MISSING` | Dane wejściowe zostały usunięte przed uruchomieniem zadania. | Wgrać plik ponownie. |
| `ENGINE_UNAVAILABLE` | Wymagany silnik nie mógł się uruchomić na serwerze. | Ponowić próbę po naprawie instalacji przez administratora. |
| `JOB_STALLED` | Nie jest zwracany klientom; oznacza raport błędu serwera. Worker utracił blokadę zadania więcej razy, niż dopuszcza kolejka, zwykle z powodu restartu serwera lub braku pamięci albo mocy procesora. Zadanie kończy się niepowodzeniem z komunikatem, że zostało przerwane. | Spróbować ponownie. Jeśli problem się powtarza, przydzielić serwerowi więcej pamięci lub obniżyć `CONCURRENT_JOBS`. |

## Uwierzytelnianie i MFA {#mfa-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Polityka MFA wymaga rejestracji, a ta instancja nie może zarejestrować użytkownika (brak licencji enterprise). Instancje z licencją zwracają 200 z `requiresMfaEnrollment: true` i prowadzą użytkownika przez rejestrację. | Nie ponawiać. Administrator musi zmienić politykę lub użyć offline'owego CLI odzyskiwania. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Serwer nie mógł odczytać polityki MFA podczas logowania. | Ponowić logowanie po chwili. |
| `INVALID_CODE` | 401 | Kod TOTP lub kod odzyskiwania jest błędny. | Poprosić użytkownika o nowy kod i spróbować ponownie. Powtarzające się niepowodzenia kończą się `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Zbyt wiele błędnych kodów. Wyzwanie zostaje odrzucone. | Rozpocząć logowanie od nowa, aby otrzymać nowe wyzwanie. |
| `MFA_EXPIRED` | 401 | Wyzwanie MFA lub rejestracji wygasło albo nie pasuje. | Rozpocząć logowanie od nowa. |
| `MFA_NOT_CONFIGURED` | 401 | Konto nie ma sekretu TOTP, więc nie można sprawdzić kodu. | Zarejestrować MFA przed zalogowaniem za pomocą kodu. |
| `MFA_ALREADY_ENABLED` | 409 | MFA jest już aktywne na koncie. | Nie rejestrować ponownie. |
| `NO_PENDING_ENROLLMENT` | 400 | Potwierdzenie rejestracji nadeszło bez oczekującej rejestracji. | Najpierw wywołać endpoint rejestracji. |
| `MFA_NOT_ENABLED` | 400 | Akcja wymaga włączonego MFA, a dla tego użytkownika jest wyłączone. | Pominąć akcję lub najpierw włączyć MFA. |
| `MFA_DECRYPTION_FAILED` | 500 | Zapisanego sekretu TOTP nie można odszyfrować. | Działanie operatora. Zwykle oznacza to, że klucz szyfrowania się zmienił. Sprawdzić `DATA_ENCRYPTION_KEY` i `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Zapisanej wartości (ustawienia, nagłówka uwierzytelniania webhooka lub sekretu TOTP) nie można odszyfrować. | Działanie operatora, jak wyżej. Nie ponawiać. |
| `IDLE_TIMEOUT` | 401 | Sesja wygasła po okresie bezczynności. | Zalogować się ponownie. |
| `INVALID_PASSWORD` | 401 | Obecne hasło jest błędne przy zmianie hasła. | Poprosić użytkownika o obecne hasło. |
| `PASSWORD_CHANGED` | 409 | Hasło zostało zmienione w innej sesji lub zresetowane przez administratora w trakcie tego żądania. | Zalogować się ponownie. |
| `OIDC_NO_PASSWORD` | 400 | Zażądano zmiany lub resetu hasła dla konta utworzonego przez SSO. | Skierować użytkownika do dostawcy tożsamości. |

## OIDC {#oidc-codes}

Błędy OIDC podczas logowania nie zwracają treści JSON. Trasa logowania przekierowuje na stronę logowania z ogólnym powodem, a dziennik audytu zapisuje kod. Trasa wylogowania nadal kończy lokalną sesję, gdy dostawca tożsamości jest nieosiągalny.

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Brak (przekierowanie) | Adres URL wystawcy to `http`, ale `EXTERNAL_URL` ma wartość `https`, więc klient odmawia wykrywania. | Administrator: udostępnić wystawcę przez `https` lub uruchomić instancję przez `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Brak (przekierowanie) | Przekroczono limit czasu wykrywania wystawcy. | Sprawdzić, czy serwer może połączyć się z wystawcą, a następnie spróbować ponownie. |
| `OIDC_DISCOVERY_FAILED` | Brak (przekierowanie) | Wykrywanie nie powiodło się z innego powodu. | Sprawdzić adres URL wystawcy i dostęp wychodzący serwera. |
| `OIDC_END_SESSION_INVALID` | Brak (wylogowanie trwa) | `end_session_endpoint` dostawcy tożsamości nie jest prawidłowym adresem URL. Lokalna sesja jest mimo to czyszczona. | Administrator: poprawić metadane dostawcy. |
| `OIDC_END_SESSION_SCHEME` | Brak (wylogowanie trwa) | `end_session_endpoint` używa schematu, którego serwer nie dopuszcza. Lokalna sesja jest mimo to czyszczona. | Administrator: poprawić metadane dostawcy. |

## SAML {#saml-codes}

Błędy SAML nie ustawiają `code`. Nieudana asercja przekierowuje na stronę logowania z `saml_auth_failed`, a zdarzenie audytu `SAML_LOGIN_FAILED` zapisuje przyczynę.

## SCIM {#scim-codes}

Trasy SCIM odpowiadają kopertą błędu RFC 7644 (`schemas`, `detail`, `status` i czasami `scimType`). Nie ustawiają `code`. Należy rozgałęziać logikę według statusu HTTP.

## Zespoły, role i użytkownicy {#team-role-codes}

Zduplikowane nazwy zespołów lub ról zwracają ogólny `CONFLICT`, a brakujący zespół lub rola zwraca `NOT_FOUND`.

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Rola wywołującego nie pozwala na tę zmianę. Cel stoi wyżej niż uprawnienia wywołującego, rola jest wbudowana albo żądanie nadaje uprawnienia, których wywołujący nie posiada. | Nie ponawiać. Poprosić użytkownika z większymi uprawnieniami. |
| `UNKNOWN_ROLE` | 400 | Identyfikator roli nie pasuje do istniejącej roli. | Poprawić identyfikator roli. Wylistować role, aby go znaleźć. |
| `UNKNOWN_TEAM` | 400 | Identyfikator zespołu nie pasuje do istniejącego zespołu. | Poprawić identyfikator zespołu. |
| `SELF_DEMOTE` | 400 | Administrator próbował usunąć własną rolę administratora. | Poprosić innego administratora o wprowadzenie zmiany. |
| `SELF_DELETE` | 400 | Administrator próbował usunąć własne konto. | Poprosić innego administratora o usunięcie. |
| `LAST_ADMIN` | 400 na trasach użytkowników, 409 na trasach czyszczenia GDPR | Zmiana pozostawiłaby instancję bez administratora lub wyczyściłaby zespół, w którym są wszyscy administratorzy. | Najpierw uczynić administratorem innego użytkownika. |
| `USER_LIMIT_REACHED` | 403 | Instancja osiągnęła limit `MAX_USERS`. | Usunąć użytkownika lub podnieść `MAX_USERS`. |

## Funkcje i pakiety AI {#feature-codes}

Narzędzia, uruchomienia wsadowe i potoki, które wymagają opcjonalnego pakietu AI, używają tych kodów.

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 lub 400 z trybu twarzy Smart Crop | Narzędzie lub jeden krok potoku albo przebiegu wsadowego wymaga pakietu, który nie jest zainstalowany. Treść zawiera `feature` (identyfikator pakietu) i `featureName`. | Zainstalować pakiet w Ustawieniach, a następnie spróbować ponownie. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Instalację lub import offline odrzucono, ponieważ biblioteki x86-64 pakietu wymagają AVX, a procesor tego serwera go nie ma. Nic nie zostało pobrane ani zainstalowane. Treść zawiera `feature` (identyfikator pakietu) i `reason` (`cpu-no-avx`). `GET /api/v1/features` zgłasza ten sam pakiet z `compatibility: "incompatible"` i `compatibilityReason: "cpu-no-avx"`. | Uruchomić SnapOtter na procesorze z AVX lub na arm64. Pozostałe pakiety nadal się instalują. |
| `FEATURE_INCOMPATIBLE` | 501 lub 400, gdy Fast OCR dostaje język, którego nie potrafi odczytać | Zainstalowana funkcja nie obsługuje żądanej jakości ani języka. | Zmienić ustawienie lub zainstalować pakiet, który to obsługuje. |
| `ENGINE_UNAVAILABLE` | 503 | Wymagany silnik nie mógł się uruchomić albo środowisko uruchomieniowe OCR zostało usunięte po walidacji żądania. | Ponowić próbę po naprawie lub ponownej instalacji funkcji przez administratora. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium nie jest zainstalowany, więc HTML na obraz nie może działać. | Poprosić administratora o instalację przeglądarki. |
| `BROWSER_CRASHED` | 503 | Przeglądarka do zrzutów ekranu uległa awarii podczas renderowania. | Ponowić żądanie. |

## Narzędzia {#tool-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Przesłane dane wejściowe zostały usunięte przed uruchomieniem zadania. | Wgrać plik ponownie i zgłosić zadanie. |
| `ANALYSIS_EXPIRED` | 410 | Analiza zdjęcia paszportowego wygasła przed generowaniem. | Przeanalizować zdjęcie ponownie, a następnie wygenerować. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Wynik usuwania tła wygasł przed krokiem następczym. | Usunąć tło ponownie. |
| `NOT_ANIMATED` | 400 | Remove GIF Background otrzymało obraz nieruchomy. | Do obrazów nieruchomych użyć Remove Background. |
| `TOO_MANY_FRAMES` | 400 | Animacja ma więcej klatek, niż dopuszcza serwer (`GIF_BG_MAX_FRAMES`). | Wysłać krótszą animację lub poprosić administratora o podniesienie limitu. |
| `TOO_MANY_PIXELS` | 400 | Płótno animacji pomnożone przez liczbę klatek przekracza limit serwera: 268 402 689 pikseli (16383 x 16383) dla Remove GIF Background lub limit obciążenia GIF dla pozostałych narzędzi do animacji. | Wysłać mniej klatek lub mniejszą animację. |
| `IMAGE_TOO_LARGE` | 400 | Obraz ma więcej pikseli, niż akceptuje dekoder. | Wysłać mniejszy obraz. |
| `RESULT_TOO_LARGE` | 400 | Ustawienia dałyby obraz większy, niż dopuszcza enkoder lub limit pikseli. | Użyć mniejszego obrazu lub ustawień dających mniejszy wynik. |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice lub pandoc nie mogły otworzyć dokumentu. Może być uszkodzony, chroniony hasłem lub w innym formacie, niż wskazuje rozszerzenie. | Sprawdzić, czy plik otwiera się w aplikacji biurowej, a następnie wysłać go ponownie. |
| `PDF_DAMAGED` | 400 | Silnik PDF wykrył uszkodzoną strukturę dokumentu. | Przepuścić plik przez Repair PDF, a następnie spróbować ponownie. |
| `PDF_PASSWORD_PROTECTED` | 400 | PDF jest zaszyfrowany i to narzędzie nie może go otworzyć. | Najpierw odblokować go za pomocą Unlock PDF. |
| `NO_AUDIO_TRACK` | 400 | Plik nie ma strumienia audio, którego mogłoby użyć narzędzie audio. | Wysłać plik z dźwiękiem. |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg nie mógł odczytać audio ani wideo: nie znalazł pakietów, parametrów kodeka, atomu `moov` ani danych, które potrafi sparsować. | Sprawdzić, czy plik odtwarza się w odtwarzaczu multimediów, lub wyeksportować go ponownie, a następnie spróbować ponownie. |
| `PAGE_OUT_OF_RANGE` | 400 | Zakres stron wskazuje stronę, której PDF nie ma. | Sprawdzić liczbę stron i wysłać zakres mieszczący się w niej. |
| `INVALID_PAGE_RANGE` | 400 | Zakres stron ma nieprawidłową składnię. | Użyć numerów stron takich jak `1-3,5`. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | Remove Pages otrzymało polecenie usunięcia wszystkich stron. | Zachować co najmniej jedną stronę. |
| `NESTING_TOO_DEEP` | 400 | JSON lub XML jest zagnieżdżony na więcej niż 100 poziomów. | Spłaszczyć dokument, a następnie go przekonwertować. |
| `IMAGE_UNDECODABLE` | 400 | Obrazu nie można zdekodować lub nie można odczytać jego wymiarów. Plik może być uszkodzony lub używać kodowania, którego dekoder nie obsługuje. | Wyeksportować obraz ponownie z innej aplikacji lub najpierw przekonwertować go do PNG lub JPEG. |
| `INVALID_SETTINGS` | 400 | Ustawienie jest poza zakresem lub nie pasuje do tego pliku: kadrowanie poza obrazem, zmiana rozmiaru na zero, klatka GIF, której animacja nie ma, specyfikacja zdjęcia paszportowego, która nie istnieje. Tekst `error` wskazuje ustawienie. | Poprawić ustawienie wskazane w `error`, a następnie spróbować ponownie. |
| `CHART_DATA_INVALID` | 400 | Chart Maker nie mógł odczytać danych wykresu z pliku: CSV lub JSON nie daje się sparsować, nie ma kolumny liczbowej, ma więcej niż 100 wierszy albo zawiera wartość ujemną. Tekst `error` podaje, który z tych przypadków zachodzi. | Wysłać CSV lub JSON z maksymalnie 100 wierszami, z których każdy to etykieta i liczba nie mniejsza od zera. |
| `NO_FACE_DETECTED` | 400 | Passport Photo nie znalazło twarzy na obrazie. | Wysłać wyraźne zdjęcie en face z dobrym oświetleniem. |
| `TARGET_SIZE_UNREACHABLE` | 400 | Kompresja lub limit rozmiaru zdjęcia paszportowego nie może zmieścić pliku poniżej żądanego rozmiaru, nawet po jego zmniejszeniu. | Zażądać większego rozmiaru docelowego lub najpierw przyciąć obraz. |
| `TOO_MANY_PAGES` | 400 | OCR otrzymało żądanie przetworzenia większej liczby stron, niż obsługuje w jednym zadaniu. | Wybrać mniej stron za pomocą zakresu stron. |
| `METADATA_DAMAGED` | 400 | Edit Metadata stwierdziło, że istniejące dane EXIF obrazu są uszkodzone, więc nie może ich bezpiecznie przepisać. | Najpierw usunąć metadane za pomocą Remove Image Metadata, a następnie edytować. |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML lub Markdown na PDF znalazło odwołanie do obrazu, arkusza stylów lub czcionki w sieci, których serwer nie pobiera. | Osadzić zasób w pliku (na przykład jako URI `data:`), a następnie spróbować ponownie. |

## Pliki {#file-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Zapis do Plików przekroczyłby limit miejsca użytkownika. | Usunąć pliki lub poprosić administratora o więcej miejsca. |
| `INVALID_STORED_NAME` | 400 | Serwer odrzucił zapisaną nazwę pliku. | Wgrać plik ponownie. |

## Potoki i przetwarzanie wsadowe {#pipeline-codes}

Żądania potoków i przetwarzania wsadowego zwracają powyższe kody funkcji dla każdego kroku, który wymaga pakietu. Identyfikator zadania, który jest już używany, zwraca `CONFLICT` ze statusem 409. Należy wysłać nowy identyfikator zadania.

## Ustawienia {#settings-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Klucz nie jest znanym ustawieniem. | Sprawdzić nazwę klucza. |
| `READONLY_SETTING` | 400 | Ustawienia nie można zmienić przez API. | Zmienić je przez środowisko lub interfejs administratora. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Nowa wartość koliduje z innymi ustawieniami. Treść wskazuje ustawienie w `setting` i wymienia problemy w `validationErrors`. | Poprawić wymienione ustawienia, a następnie spróbować ponownie. |
| `SETTING_DECRYPTION_FAILED` | 500 | Zapisanego ustawienia nie można odszyfrować. | Działanie operatora, jak w przypadku `DECRYPTION_FAILED`. |

Dla `VALIDATION_ERROR` przy ustawieniu `details` zawiera problemy ze schematem.

## Enterprise {#enterprise-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Ustawienie lub polityka wymaga licencji enterprise, na przykład wymuszanie SSO lub polityka MFA. | Użyć instancji z licencją lub pozostawić ustawienie wyłączone. |
| `IP_NOT_ALLOWED` | 403 | Adres IP żądania nie znajduje się na liście dozwolonych. | Połączyć się z dozwolonej sieci. |
| `INVALID_CIDR` | 400 | Wpis listy dozwolonych nie jest prawidłowym CIDR. Komunikat wymienia błędne wpisy. | Poprawić wpisy i zapisać ponownie. |
| `SELF_LOCKOUT` | 400 | Zapisanie listy dozwolonych zablokowałoby bieżący adres IP wywołującego. | Najpierw dodać swój bieżący adres IP do listy. |

Trasy czyszczenia GDPR zwracają zwykły `CONFLICT` ze statusem 409, gdy użytkownik lub zespół jest objęty blokadą prawną.

## Kody, których klienci nie otrzymują {#internal-codes}

Te kody istnieją w kodzie źródłowym serwera na potrzeby logów, telemetrii lub własnych błędów Fastify. Klient nie otrzymuje ich w treści odpowiedzi ani w wierszu zadania, więc nie należy opierać na nich logiki klienta.

| `code` | Dokąd trafia |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Zgłaszany do śledzenia błędów przez ewaluator alertów. Nagłówka uwierzytelniania webhooka alertu nie można odszyfrować. |
| `SIEM_DECRYPTION_FAILED` | Zgłaszany do śledzenia błędów przez przekazywanie do SIEM. Nagłówka uwierzytelniania SIEM nie można odszyfrować. |
| `WEBHOOK_DECRYPTION_FAILED` | Zgłaszany do śledzenia błędów. Żądanie, które napotkało tę samą awarię, odpowiada `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Zgłaszany do śledzenia błędów, gdy nie można usunąć przygotowanego uploadu. |
| `USERNAME_RACE_EXHAUSTED` | Zgłaszany, gdy automatyczne tworzenie kont SSO przegrywa wyścig o nazwę użytkownika przy każdej próbie. Strona logowania pokazuje zamiast tego błąd. |
| `ERR_OUT_OF_RANGE` | Zgłaszany przez czytnik magazynu obiektów dla nieprawidłowego zakresu bajtów. |
| `ETIMEDOUT` | Ustawiany na błędzie przekroczenia czasu eksportu GDPR. Eksport kończy się niepowodzeniem i można zażądać go ponownie. |
| `FST_REQ_FILE_TOO_LARGE` | Kod Fastify dla uploadu przekraczającego limit. Klienci dostają 413 z `PAYLOAD_TOO_LARGE` lub własny komunikat 413 trasy. |
| `TARGET_SIZE_EXCEEDED` | Zgłaszany, gdy kompresja do rozmiaru docelowego nie osiąga celu. Błąd nie ma statusu ani kodu, więc klienci dostają ogólny komunikat o niepowodzeniu. |
| `OCR_CACHE_PERMISSIONS` | Zgłaszany do śledzenia błędów jako usterka operacyjna, gdy wolumen danych AI pozostawia pamięć podręczną środowiska OCR z uprawnieniami zapisu dla wszystkich. Zadanie instalacji kończy się niepowodzeniem z komunikatem wskazującym problem z magazynem. |
| `OCR_RUNTIME_UNREACHABLE` | Zgłaszany do śledzenia błędów jako usterka operacyjna, gdy serwer nigdy nie połączył się z huggingface.co, aby pobrać środowisko OCR. Zadanie instalacji kończy się niepowodzeniem z komunikatem o dostępie do sieci, `HTTPS_PROXY` i imporcie offline. |
