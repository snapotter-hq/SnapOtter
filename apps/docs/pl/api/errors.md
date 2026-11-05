---
title: "Kody błędów"
description: "Kształt treści błędu, stabilne kody i co zrobić w przypadku każdego z nich."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: 285a90c379cc
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

Nieudane zadanie zachowuje `error.code` tylko wtedy, gdy przyczyną jest błąd danych wejściowych lub awaria serwera. Pozostałe niepowodzenia zawierają wyłącznie komunikat.

| `code` | Znaczenie | Co zrobić |
|--------|---------|------------|
| `CANCELED` | Zadanie zostało anulowane przez użytkownika. To nie jest status HTTP. Zdarzenia postępu niosą `phase: failed` z tym kodem. | Traktować to jako anulowanie przez użytkownika. Nie ponawiać automatycznie. |
| `INPUT_MISSING` | Dane wejściowe zostały usunięte przed uruchomieniem zadania. | Przesłać plik ponownie. |
| `ENGINE_UNAVAILABLE` | Wymagany silnik nie mógł wystartować na serwerze. | Ponowić próbę po naprawie instalacji przez administratora. |

## Uwierzytelnianie i MFA {#mfa-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Polityka MFA wymaga rejestracji, a ta instancja nie może zarejestrować użytkownika (brak licencji enterprise). Instancje z licencją zwracają 200 z `requiresMfaEnrollment: true` i prowadzą użytkownika przez rejestrację. | Nie ponawiać. Administrator musi zmienić politykę lub użyć narzędzia CLI do odzyskiwania offline. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Serwer nie mógł odczytać polityki MFA podczas logowania. | Wkrótce ponowić logowanie. |
| `INVALID_CODE` | 401 | Kod TOTP lub kod odzyskiwania jest błędny. | Poprosić użytkownika o nowy kod i spróbować ponownie. Powtarzające się niepowodzenia kończą się kodem `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Zbyt wiele błędnych kodów. Wyzwanie zostaje odrzucone. | Rozpocząć logowanie od nowa, aby otrzymać nowe wyzwanie. |
| `MFA_EXPIRED` | 401 | Wyzwanie MFA lub rejestracji wygasło albo nie pasuje. | Rozpocząć logowanie od nowa. |
| `MFA_NOT_CONFIGURED` | 401 | Konto nie ma sekretu TOTP, więc nie można sprawdzić kodu. | Zarejestrować MFA przed logowaniem z kodem. |
| `MFA_ALREADY_ENABLED` | 409 | MFA jest już aktywne na koncie. | Nie rejestrować ponownie. |
| `NO_PENDING_ENROLLMENT` | 400 | Potwierdzenie rejestracji nadeszło bez oczekującej rejestracji. | Najpierw wywołać endpoint rejestracji. |
| `MFA_NOT_ENABLED` | 400 | Czynność wymaga włączonego MFA, a dla tego użytkownika jest wyłączone. | Pominąć czynność lub najpierw włączyć MFA. |
| `MFA_DECRYPTION_FAILED` | 500 | Zapisanego sekretu TOTP nie można odszyfrować. | Działanie operatora. Zwykle oznacza to, że zmienił się klucz szyfrowania. Sprawdzić `DATA_ENCRYPTION_KEY` i `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Zapisanej wartości (ustawienia, nagłówka uwierzytelniania webhooka lub sekretu TOTP) nie można odszyfrować. | Działanie operatora, jak wyżej. Nie ponawiać. |
| `IDLE_TIMEOUT` | 401 | Sesja wygasła po okresie bezczynności. | Zalogować się ponownie. |
| `INVALID_PASSWORD` | 401 | Bieżące hasło jest błędne przy zmianie hasła. | Poprosić użytkownika o bieżące hasło. |
| `PASSWORD_CHANGED` | 409 | Hasło zostało zmienione w innej sesji lub zresetowane przez administratora, gdy to żądanie było w toku. | Zalogować się ponownie. |
| `OIDC_NO_PASSWORD` | 400 | Zażądano zmiany lub resetu hasła dla konta utworzonego przez SSO. | Skierować użytkownika do dostawcy tożsamości. |

## OIDC {#oidc-codes}

Błędy OIDC podczas logowania nie zwracają treści JSON. Trasa logowania przekierowuje na stronę logowania z ogólną przyczyną, a dziennik audytu zapisuje kod. Trasa wylogowania nadal kończy sesję lokalną, gdy nie można połączyć się z dostawcą tożsamości.

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Brak (przekierowanie) | Adres URL wystawcy to `http`, ale `EXTERNAL_URL` to `https`, więc klient odmawia wykrywania. | Administrator: udostępnić wystawcę przez `https` lub uruchomić instancję przez `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Brak (przekierowanie) | Upłynął czas wykrywania wystawcy. | Sprawdzić, czy serwer ma dostęp do wystawcy, a następnie ponowić próbę. |
| `OIDC_DISCOVERY_FAILED` | Brak (przekierowanie) | Wykrywanie nie powiodło się z innej przyczyny. | Sprawdzić adres URL wystawcy i dostęp wychodzący serwera. |
| `OIDC_END_SESSION_INVALID` | Brak (wylogowanie trwa) | `end_session_endpoint` dostawcy tożsamości nie jest prawidłowym adresem URL. Sesja lokalna i tak zostaje wyczyszczona. | Administrator: poprawić metadane dostawcy. |
| `OIDC_END_SESSION_SCHEME` | Brak (wylogowanie trwa) | `end_session_endpoint` używa schematu, którego serwer nie dopuszcza. Sesja lokalna i tak zostaje wyczyszczona. | Administrator: poprawić metadane dostawcy. |

## SAML {#saml-codes}

Błędy SAML nie ustawiają `code`. Nieudana asercja przekierowuje na stronę logowania z `saml_auth_failed`, a powód zapisuje zdarzenie audytu `SAML_LOGIN_FAILED`.

## SCIM {#scim-codes}

Trasy SCIM odpowiadają kopertą błędu z RFC 7644 (`schemas`, `detail`, `status`, a czasem `scimType`). Nie ustawiają `code`. Należy rozgałęziać logikę według statusu HTTP.

## Zespoły, role i użytkownicy {#team-role-codes}

Zduplikowane nazwy zespołów lub ról zwracają ogólny `CONFLICT`, a brakujący zespół lub rola zwraca `NOT_FOUND`.

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Rola wywołującego nie zezwala na zmianę. Cel znajduje się powyżej uprawnień wywołującego, rola jest wbudowana albo żądanie nadaje uprawnienia, których wywołujący nie posiada. | Nie ponawiać. Poprosić użytkownika z większymi uprawnieniami. |
| `UNKNOWN_ROLE` | 400 | Identyfikator roli nie pasuje do istniejącej roli. | Poprawić identyfikator roli. Wyświetlić listę ról, aby go znaleźć. |
| `UNKNOWN_TEAM` | 400 | Identyfikator zespołu nie pasuje do istniejącego zespołu. | Poprawić identyfikator zespołu. |
| `SELF_DEMOTE` | 400 | Administrator próbował usunąć własną rolę administratora. | Niech zmiany dokona inny administrator. |
| `SELF_DELETE` | 400 | Administrator próbował usunąć własne konto. | Niech konto usunie inny administrator. |
| `LAST_ADMIN` | 400 na trasach użytkowników, 409 na trasach czyszczenia RODO | Zmiana nie pozostawiłaby żadnego administratora lub usunęłaby zespół, w którym są wszyscy administratorzy. | Najpierw nadać rolę administratora innemu użytkownikowi. |
| `USER_LIMIT_REACHED` | 403 | Instancja osiągnęła limit `MAX_USERS`. | Usunąć użytkownika lub podnieść `MAX_USERS`. |

## Funkcje i pakiety AI {#feature-codes}

Narzędzia, uruchomienia wsadowe i potoki, które wymagają opcjonalnego pakietu AI, używają tych kodów.

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | Narzędzie lub jeden krok potoku albo wsadu wymaga pakietu, który nie jest zainstalowany. Treść zawiera `feature` (identyfikator pakietu) i `featureName`. | Zainstalować pakiet w Ustawieniach, a następnie ponowić próbę. |
| `FEATURE_INCOMPATIBLE` | 501 | Zainstalowana funkcja nie obsługuje żądanej jakości ani języka. | Zmienić ustawienie lub zainstalować pakiet, który to obsługuje. |
| `ENGINE_UNAVAILABLE` | 503 | Wymagany silnik nie mógł wystartować albo środowisko OCR zostało usunięte po sprawdzeniu poprawności żądania. | Ponowić próbę po naprawie lub ponownej instalacji funkcji przez administratora. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium nie jest zainstalowany, więc HTML to image nie może działać. | Poprosić administratora o instalację przeglądarki. |
| `BROWSER_CRASHED` | 503 | Przeglądarka do zrzutów ekranu uległa awarii podczas renderowania. | Ponowić żądanie. |

## Narzędzia {#tool-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Przesłane dane wejściowe zostały usunięte przed uruchomieniem zadania. | Przesłać plik ponownie i zgłosić zadanie. |
| `ANALYSIS_EXPIRED` | 410 | Analiza zdjęcia paszportowego wygasła przed wygenerowaniem. | Przeanalizować zdjęcie ponownie, a następnie wygenerować. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Wynik usuwania tła wygasł przed krokiem następczym. | Usunąć tło ponownie. |
| `NOT_ANIMATED` | 400 | Remove GIF Background otrzymało obraz nieruchomy. | Dla obrazów nieruchomych użyć Remove Background. |
| `TOO_MANY_FRAMES` | 400 | Animacja ma więcej klatek, niż dopuszcza serwer (`GIF_BG_MAX_FRAMES`). | Wysłać krótszą animację lub poprosić administratora o podniesienie limitu. |

## Pliki {#file-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Zapis w Plikach przekroczyłby limit miejsca użytkownika. | Usunąć pliki lub poprosić administratora o więcej miejsca. |
| `INVALID_STORED_NAME` | 400 | Serwer odrzucił zapisaną nazwę pliku. | Przesłać plik ponownie. |

## Potoki i wsad {#pipeline-codes}

Żądania potoków i wsadów zwracają powyższe kody funkcji dla każdego kroku, który wymaga pakietu. Identyfikator zadania, który jest już używany, zwraca `CONFLICT` ze statusem 409. Należy wysłać nowy identyfikator zadania.

## Ustawienia {#settings-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Klucz nie jest znanym ustawieniem. | Sprawdzić nazwę klucza. |
| `READONLY_SETTING` | 400 | Ustawienia nie można zmienić przez API. | Zmienić je przez środowisko lub panel administratora. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Nowa wartość koliduje z innymi ustawieniami. Treść wskazuje ustawienie w `setting` i wymienia problemy w `validationErrors`. | Poprawić wymienione ustawienia, a następnie ponowić próbę. |
| `SETTING_DECRYPTION_FAILED` | 500 | Zapisanego ustawienia nie można odszyfrować. | Działanie operatora, jak w przypadku `DECRYPTION_FAILED`. |

Dla `VALIDATION_ERROR` przy ustawieniu `details` zawiera problemy ze schematem.

## Enterprise {#enterprise-codes}

| `code` | Status | Znaczenie | Co zrobić |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Ustawienie lub polityka wymaga licencji enterprise, na przykład wymuszanie SSO albo polityka MFA. | Użyć instancji z licencją lub zostawić ustawienie wyłączone. |
| `IP_NOT_ALLOWED` | 403 | Adres IP żądania nie znajduje się na liście dozwolonych. | Połączyć się z dozwolonej sieci. |
| `INVALID_CIDR` | 400 | Wpis listy dozwolonych nie jest prawidłowym CIDR. Komunikat wymienia błędne wpisy. | Poprawić wpisy i zapisać ponownie. |
| `SELF_LOCKOUT` | 400 | Zapisanie listy dozwolonych zablokowałoby bieżący adres IP wywołującego. | Najpierw dodać bieżący adres IP do listy. |

Trasy czyszczenia RODO zwracają zwykły `CONFLICT` ze statusem 409, gdy użytkownik lub zespół podlega blokadzie prawnej.

## Kody, których klienci nie otrzymują {#internal-codes}

Te kody istnieją w kodzie źródłowym serwera na potrzeby logów, telemetrii lub własnych błędów Fastify. Klient nie dostaje ich w treści odpowiedzi ani w wierszu zadania, więc nie należy opierać na nich logiki klienta.

| `code` | Dokąd trafia |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Zgłaszany do śledzenia błędów przez ewaluator alertów. Nagłówka uwierzytelniania webhooka alertu nie można odszyfrować. |
| `SIEM_DECRYPTION_FAILED` | Zgłaszany do śledzenia błędów przez przekazywanie do SIEM. Nagłówka uwierzytelniania SIEM nie można odszyfrować. |
| `WEBHOOK_DECRYPTION_FAILED` | Zgłaszany do śledzenia błędów. Żądanie, które trafiło na tę samą awarię, odpowiada `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Zgłaszany do śledzenia błędów, gdy nie można usunąć przygotowanego przesłania. |
| `USERNAME_RACE_EXHAUSTED` | Zgłaszany, gdy automatyczne tworzenie konta przez SSO przegrywa wyścig o nazwę użytkownika przy każdej próbie. Strona logowania pokazuje zamiast tego błąd. |
| `ERR_OUT_OF_RANGE` | Zgłaszany przez czytnik magazynu obiektów dla nieprawidłowego zakresu bajtów. |
| `ETIMEDOUT` | Ustawiany na błędzie przekroczenia czasu eksportu RODO. Eksport kończy się niepowodzeniem i można go zażądać ponownie. |
| `FST_REQ_FILE_TOO_LARGE` | Kod Fastify dla przesłania ponad limit. Klienci dostają 413 z `PAYLOAD_TOO_LARGE` albo własny komunikat 413 trasy. |
| `TARGET_SIZE_EXCEEDED` | Zgłaszany, gdy kompresja do rozmiaru docelowego nie osiąga celu. Błąd nie ma statusu ani kodu, więc klienci dostają ogólne niepowodzenie. |