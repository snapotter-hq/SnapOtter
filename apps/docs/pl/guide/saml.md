---
description: "Skonfiguruj logowanie jednokrotne SAML 2.0 dla SnapOtter. Przewodniki krok po kroku dla Okta, Azure AD / Entra ID, Google Workspace i innych dostawców tożsamości SAML."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 7da57fbad7c8
---

# SAML SSO {#saml-sso}

SnapOtter obsługuje SAML 2.0 do logowania jednokrotnego. Użytkownicy mogą logować się przez zewnętrznego dostawcę tożsamości (Okta, Azure AD / Entra ID, Google Workspace lub dowolny standardowy dostawca tożsamości SAML 2.0) zamiast lokalnego uwierzytelniania nazwą użytkownika i hasłem.

::: tip Funkcja Enterprise
SAML SSO wymaga licencji **team** lub **enterprise** z funkcją `saml_sso`. Jeśli `SAML_ENABLED=true` jest ustawione bez ważnej licencji, trasy SAML są po cichu pomijane, a w logach zapisywane jest ostrzeżenie.
:::

## Wymagania wstępne {#prerequisites}

- Działająca instancja SnapOtter osiągalna pod publicznym adresem URL
- `EXTERNAL_URL` ustawione na ten publiczny adres URL (np. `https://photos.example.com`)
- Klucz licencji team lub enterprise z funkcją `saml_sso`
- Dostęp administracyjny do Twojego dostawcy tożsamości SAML

## Szybki start {#quick-start}

Dodaj te zmienne środowiskowe do swojego `docker-compose.yml`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

Uruchom ponownie kontener. Na stronie logowania pojawia się przycisk „Zaloguj się przez SAML” (lub etykieta ustawiona przez `SAML_PROVIDER_NAME`).

## Dokumentacja konfiguracji {#configuration-reference}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `SAML_ENABLED` | `false` | Włącz logowanie SAML. |
| `SAML_IDP_SSO_URL` | | Adres URL punktu końcowego SSO dostawcy tożsamości. **Wymagane**, gdy SAML jest włączone. |
| `SAML_IDP_CERTIFICATE` | | Certyfikat podpisujący X.509 dostawcy tożsamości w formacie PEM (sam tekst certyfikatu, a nie ścieżka do pliku). **Wymagane**, gdy SAML jest włączone. |
| `EXTERNAL_URL` | | Publiczny URL, pod którym SnapOtter jest osiągalny. **Wymagane**, gdy SAML jest włączone. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI wysyłane do dostawcy tożsamości. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Adres URL Assertion Consumer Service (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Automatycznie utwórz lokalne konto użytkownika przy pierwszym logowaniu SAML. |
| `SAML_AUTO_LINK_USERS` | `false` | Powiąż tożsamość SAML z istniejącym lokalnym użytkownikiem, jeśli adres e-mail się zgadza. |
| `SAML_DEFAULT_ROLE` | `user` | Rola przypisana automatycznie tworzonym użytkownikom SAML. Jedna z: `admin`, `editor` lub `user`. |
| `SAML_PROVIDER_NAME` | | Etykieta wyświetlana dla przycisku logowania SAML we frontendzie (np. „Okta”, „Azure AD”). Jeśli puste, przycisk pokazuje „SAML”. |
| `SAML_USERNAME_ATTRIBUTE` | | Atrybut asercji SAML używany jako nazwa użytkownika. Jeśli puste, wraca do lokalnej części e-maila, a następnie NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Atrybut asercji SAML używany jako adres e-mail użytkownika. |

Serwer odmawia uruchomienia, jeśli `SAML_ENABLED=true` i brakuje którejkolwiek z trzech wymaganych zmiennych (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`).

::: details Uwagi dotyczące bezpieczeństwa
Zarówno `wantAuthnResponseSigned`, jak i `wantAssertionsSigned` są zakodowane na stałe na `true`. SnapOtter odrzuca niepodpisane lub nieprawidłowo podpisane odpowiedzi SAML. Asercje od zaufanego dostawcy tożsamości są traktowane jako e-mail zweryfikowany.

Obsługiwane jest tylko logowanie inicjowane przez SP. SnapOtter nie obsługuje logowania inicjowanego przez dostawcę tożsamości (niezamówionego) ani wylogowania jednokrotnego (SLO). Wylogowanie z SnapOtter nie wylogowuje użytkownika z dostawcy tożsamości.
:::

## Metadane SP i adresy URL {#sp-metadata-and-urls}

Twój dostawca tożsamości potrzebuje trzech wartości od SnapOtter:

| Pole | Wartość |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **Metadane SP** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Na przykład, jeśli `EXTERNAL_URL` to `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Punkt końcowy metadanych: `https://photos.example.com/api/auth/saml/metadata` (zwraca XML)

Niektórzy dostawcy tożsamości mogą bezpośrednio zaimportować URL metadanych SP, co automatycznie uzupełnia ACS URL i Entity ID.

## Konfiguracja dostawcy {#provider-setup}

### Okta {#okta}

1. W konsoli administracyjnej Okta przejdź do **Applications > Create App Integration**.
2. Wybierz **SAML 2.0** i kliknij **Next**.
3. Ustaw nazwę (np. „SnapOtter”) i kliknij **Next**.
4. Skonfiguruj ustawienia SAML:
   - **Single sign-on URL**: Twój ACS URL (np. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Twój Entity ID (np. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. W sekcji **Attribute Statements** dodaj `email` zmapowane na `user.email`.
6. Kliknij **Next**, a następnie **Finish**.
7. Przejdź do zakładki **Sign On**, kliknij **View SAML setup instructions** i skopiuj:
   - **Identity Provider Single Sign-On URL** do `SAML_IDP_SSO_URL`
   - **X.509 Certificate** do `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. W portalu Azure przejdź do **Microsoft Entra ID > Enterprise applications > New application**.
2. Kliknij **Create your own application**, nazwij ją „SnapOtter” i wybierz **Integrate any other application you don't find in the gallery**.
3. Przejdź do **Single sign-on > SAML** i kliknij **Edit** w sekcji **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Twój Entity ID (np. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Twój ACS URL (np. `https://photos.example.com/api/auth/saml/callback`)
4. W sekcji **SAML Certificates** pobierz **Certificate (Base64)**.
5. W sekcji **Set up SnapOtter** skopiuj **Login URL**.
6. Ustaw `SAML_IDP_SSO_URL` na Login URL, a `SAML_IDP_CERTIFICATE` na zawartość pobranego certyfikatu.
7. Przypisz użytkowników lub grupy do aplikacji w sekcji **Users and groups**.

### Google Workspace {#google-workspace}

1. W konsoli administracyjnej Google przejdź do **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Nazwij aplikację „SnapOtter” i kliknij **Continue**.
3. Na stronie **Google Identity Provider details** skopiuj **SSO URL** i pobierz **Certificate**. Kliknij **Continue**.
4. Skonfiguruj szczegóły dostawcy usług (Service Provider):
   - **ACS URL**: Twój ACS URL (np. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Twój Entity ID (np. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Kliknij **Continue**, a następnie **Finish**.
6. Włącz aplikację (**ON**) dla swoich jednostek organizacyjnych.
7. Ustaw `SAML_IDP_SSO_URL` na SSO URL z kroku 3, a `SAML_IDP_CERTIFICATE` na zawartość pobranego certyfikatu.

### Ogólny dostawca tożsamości SAML 2.0 {#generic-saml-2-0-idp}

Dla dowolnego dostawcy tożsamości zgodnego z SAML 2.0:

1. Utwórz nową aplikację SAML / dostawcę usług w swoim dostawcy tożsamości.
2. Ustaw **ACS URL** na `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Ustaw **Entity ID** / **Audience** na `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Skonfiguruj dostawcę tożsamości tak, aby wysyłał adres e-mail użytkownika w atrybucie o nazwie `email` (lub ustaw `SAML_EMAIL_ATTRIBUTE`, aby dopasować do nazwy atrybutu Twojego dostawcy tożsamości).
5. Skopiuj **IdP SSO URL** oraz **certyfikat podpisujący** do `SAML_IDP_SSO_URL` i `SAML_IDP_CERTIFICATE`.

## Provisioning użytkowników {#user-provisioning}

### Automatyczne tworzenie {#auto-create}

Gdy `SAML_AUTO_CREATE_USERS` ma wartość `true` (domyślnie), lokalne konto użytkownika jest tworzone przy pierwszym logowaniu przez SAML. Rola jest ustawiana na `SAML_DEFAULT_ROLE`.

Nazwa użytkownika jest ustalana w tej kolejności:

1. Wartość atrybutu asercji określonego przez `SAML_USERNAME_ATTRIBUTE` (jeśli ustawiony i obecny)
2. Lokalna część adresu e-mail (wszystko przed `@`)
3. SAML NameID

Jeśli wystąpi konflikt nazw użytkowników, dodawany jest sufiks numeryczny (np. `jane` staje się `jane_2`).

### Automatyczne łączenie {#auto-link}

Gdy `SAML_AUTO_LINK_USERS` ma wartość `true`, SnapOtter łączy tożsamość SAML z istniejącym lokalnym kontem, jeśli adresy e-mail się zgadzają. Jest to przydatne, gdy masz wcześniej utworzone konta użytkowników i chcesz, aby zaczęli korzystać z SSO bez utraty swoich danych.

::: warning 
Włączaj automatyczne łączenie tylko wtedy, gdy ufasz, że Twój dostawca tożsamości SAML weryfikuje adresy e-mail. Niezweryfikowany e-mail od źle skonfigurowanego dostawcy tożsamości mógłby pozwolić komuś na przejęcie konta innego użytkownika.
:::

### Mapowanie atrybutów {#attribute-mapping}

| Pole SnapOtter | Źródło | Konfiguracja |
|---|---|---|
| Email | Atrybut asercji | `SAML_EMAIL_ATTRIBUTE` (domyślnie: `email`) |
| Nazwa użytkownika | Atrybut asercji, e-mail lub NameID | `SAML_USERNAME_ATTRIBUTE` (zobacz kolejność ustalania powyżej) |
| Identyfikator zewnętrzny | NameID | Zawsze SAML NameID, nie do skonfigurowania |

## Wymuszanie SSO {#sso-enforcement}

Jeśli chcesz wymagać, aby wszyscy użytkownicy logowali się przez SAML (lub OIDC) i zablokować lokalne logowanie hasłem, włącz wymuszanie SSO:

1. Upewnij się, że funkcja enterprise `sso_enforcement` jest objęta licencją (dostępna w planach team i enterprise).
2. W **Admin Settings > Security** przełącz **SSO Enforcement** na włączone.
3. Ustaw **break-glass username**: to jedno lokalne konto, które nadal może logować się hasłem, na wypadek awaryjnego dostępu, gdy dostawca tożsamości jest nieosiągalny.

Gdy wymuszanie SSO jest aktywne, każda próba lokalnego logowania (poza użytkownikiem break-glass) zwraca błąd 403 z komunikatem „Local password login is disabled. Please use SSO.”

::: tip 
Zawsze skonfiguruj break-glass username przed włączeniem wymuszania SSO. Bez niego możesz zostać zablokowany poza SnapOtter, jeśli Twój dostawca tożsamości ulegnie awarii.
:::

## Używanie SAML obok OIDC {#using-saml-alongside-oidc}

SAML i OIDC można włączyć jednocześnie. Gdy oba są aktywne, strona logowania pokazuje osobne przyciski dla każdego dostawcy (oznaczone przez `SAML_PROVIDER_NAME` i `OIDC_PROVIDER_NAME`). Użytkownicy mogą logować się dowolną metodą.

Obaj dostawcy niezależnie korzystają z tych samych ustawień automatycznego tworzenia, automatycznego łączenia i wymuszania SSO: każdy ma własne zmienne `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` oraz `*_DEFAULT_ROLE`.

## Rozwiązywanie problemów {#troubleshooting}

### Walidacja asercji nie powiodła się {#assertion-validation-failed}

Nie udało się zweryfikować podpisu odpowiedzi SAML lub podpisu asercji. Sprawdź:

- Czy certyfikat w `SAML_IDP_CERTIFICATE` zgadza się z aktualnym certyfikatem podpisującym w Twoim dostawcy tożsamości (certyfikaty się rotują, więc sprawdź datę wygaśnięcia)
- Czy certyfikat jest w formacie PEM (zaczyna się od `-----BEGIN CERTIFICATE-----`)
- Czy certyfikat to pełny tekst, a nie ścieżka do pliku
- Czy ACS URL i Entity ID skonfigurowane w Twoim dostawcy tożsamości dokładnie zgadzają się z wartościami SnapOtter (schemat, host, port, ścieżka)

### Brakujące atrybuty {#missing-attributes}

Jeśli po zalogowaniu nazwy użytkowników lub adresy e-mail są puste, Twój dostawca tożsamości może nie wysyłać oczekiwanych atrybutów. Sprawdź:

- Czy Twój dostawca tożsamości jest skonfigurowany, aby udostępniać atrybut `email` (lub taki, na jaki ustawiono `SAML_EMAIL_ATTRIBUTE`)
- Jeśli używasz `SAML_USERNAME_ATTRIBUTE`, zweryfikuj, że ten atrybut jest zawarty w asercji
- Niektórzy dostawcy tożsamości wymagają jawnej konfiguracji mapowania atrybutów, zanim udostępnią oświadczenia

### Odchylenie zegara {#clock-skew}

Asercje SAML zawierają warunki znacznika czasu (`NotBefore`, `NotOnOrAfter`). Jeśli zegar Twojego serwera i zegar dostawcy tożsamości nie są zsynchronizowane, walidacja asercji się nie powiedzie. Uruchom NTP na obu maszynach, aby zegary były zsynchronizowane.

### „SAML is enabled via env but saml_sso enterprise feature is not licensed” {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

To ostrzeżenie pojawia się w logach serwera, gdy `SAML_ENABLED=true`, ale licencja nie obejmuje funkcji `saml_sso`. Zweryfikuj swój klucz licencji i plan. Funkcja `saml_sso` jest dostępna w planach team i enterprise.

### Logowanie przekierowuje z powrotem z błędem {#login-redirects-back-with-error}

Jeśli kliknięcie przycisku logowania SAML przekierowuje z powrotem na stronę logowania z błędem, sprawdź szczegóły w logach serwera. Częste przyczyny:

- IdP SSO URL jest nieosiągalny z serwera
- Dostawca tożsamości odrzucił żądanie uwierzytelnienia (sprawdź logi audytu dostawcy tożsamości)
- Dostawca tożsamości zwrócił niepodpisaną odpowiedź (SnapOtter wymaga, aby zarówno odpowiedź, jak i asercja były podpisane)
