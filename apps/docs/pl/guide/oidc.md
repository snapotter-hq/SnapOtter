---
description: "Skonfiguruj logowanie jednokrotne z OpenID Connect. Przewodniki krok po kroku dla Keycloak, Authentik, Google i innych dostawców OIDC."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 0a980a795fc3
---

# OIDC / Logowanie jednokrotne {#oidc-single-sign-on}

SnapOtter obsługuje OpenID Connect (OIDC) do logowania jednokrotnego. Użytkownicy mogą logować się za pomocą zewnętrznego dostawcy tożsamości, takiego jak Keycloak, Authentik czy Google, zamiast (lub obok) lokalnego uwierzytelniania nazwą użytkownika i hasłem.

::: tip Zobacz też
[SAML SSO](/pl/guide/saml) | [Provisioning SCIM](/pl/guide/scim) | [Użytkownicy, role i uprawnienia](/pl/guide/users-roles)
:::

## Szybki start {#quick-start}

Dodaj te zmienne środowiskowe do swojego `docker-compose.yml`:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

URI przekierowania dla Twojego dostawcy zawsze wynosi:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Na przykład, jeśli `EXTERNAL_URL` to `https://photos.example.com`, skonfiguruj URI przekierowania dostawcy jako `https://photos.example.com/api/auth/oidc/callback`.

## Dokumentacja konfiguracji {#configuration-reference}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `OIDC_ENABLED` | `false` | Włącz logowanie OIDC. Na stronie logowania pojawia się przycisk „Zaloguj się przez SSO”. |
| `OIDC_ISSUER_URL` | | URL wydawcy (issuer) dostawcy. Musi obsługiwać OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | Identyfikator klienta OAuth zarejestrowany u Twojego dostawcy. |
| `OIDC_CLIENT_SECRET` | | Sekret klienta OAuth. |
| `OIDC_SCOPES` | `openid profile email` | Lista zakresów do zażądania, rozdzielona spacjami. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Automatycznie utwórz lokalne konto użytkownika przy pierwszym logowaniu OIDC. |
| `OIDC_DEFAULT_ROLE` | `user` | Rola przypisana automatycznie tworzonym użytkownikom OIDC. Jedna z: `admin`, `editor` lub `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Powiąż tożsamość OIDC z istniejącym lokalnym użytkownikiem, jeśli adres e-mail się zgadza. |
| `OIDC_PROVIDER_NAME` | | Wyświetlana nazwa na przycisku logowania (np. „Keycloak”, „Google”). Jeśli puste, przycisk pokazuje „SSO”. |
| `OIDC_CLOCK_TOLERANCE` | `30` | Tolerancja odchylenia zegara w sekundach przy walidacji tokenu. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Oświadczenie (claim) tokenu ID używane jako nazwa użytkownika dla nowych kont. |
| `EXTERNAL_URL` | | Publiczny URL, pod którym SnapOtter jest osiągalny. Wymagany, aby OIDC zbudowało poprawne URI przekierowania. |
| `COOKIE_SECRET` | generowany automatycznie | Sekret do podpisywania ciasteczek sesji. Ustaw go jawnie, gdy uruchamiasz wiele replik. |

## Przewodniki dla dostawców {#provider-guides}

### Keycloak {#keycloak}

1. Utwórz nowy realm (lub użyj istniejącego).
2. Przejdź do **Clients** i utwórz nowego klienta:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (poufny)
   - **Authentication flow**: Standard flow (Authorization Code)
3. W zakładce **Settings** klienta ustaw **Valid redirect URIs** na swój adres URL wywołania zwrotnego (np. `https://photos.example.com/api/auth/oidc/callback`).
4. Skopiuj **Client secret** z zakładki **Credentials**.
5. Ustaw `OIDC_ISSUER_URL` na `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. W interfejsie administracyjnym przejdź do **Applications > Providers** i utwórz nowego **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: Twój adres URL wywołania zwrotnego
   - **Signing key**: Wybierz istniejący klucz lub utwórz nowy
2. Utwórz **Application** i powiąż ją z dostawcą.
3. Skopiuj **Client ID** oraz **Client Secret** z ustawień dostawcy.
4. Ustaw `OIDC_ISSUER_URL` na `https://authentik.example.com/application/o/snapotter/` (końcowy ukośnik ma znaczenie).

### Google {#google}

1. Przejdź do [Google Cloud Console](https://console.cloud.google.com/).
2. Utwórz projekt (lub wybierz istniejący).
3. Przejdź do **APIs & Services > OAuth consent screen** i skonfiguruj go.
4. Przejdź do **APIs & Services > Credentials** i utwórz **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Twój adres URL wywołania zwrotnego
5. Skopiuj **Client ID** oraz **Client secret**.
6. Ustaw `OIDC_ISSUER_URL` na `https://accounts.google.com`.
7. Ustaw `OIDC_USERNAME_CLAIM` na `email` (Google nie udostępnia `preferred_username`).

## Provisioning użytkowników {#user-provisioning}

### Automatyczne tworzenie {#auto-create}

Gdy `OIDC_AUTO_CREATE_USERS` ma wartość `true` (domyślnie), lokalne konto użytkownika jest tworzone przy pierwszym logowaniu przez OIDC. Nazwa użytkownika pochodzi z oświadczenia (claim) określonego przez `OIDC_USERNAME_CLAIM`, a rola jest ustawiana na `OIDC_DEFAULT_ROLE`.

Jeśli wystąpi konflikt nazw użytkowników, dodawany jest sufiks numeryczny (np. `jane` staje się `jane_2`).

### Automatyczne łączenie {#auto-link}

Gdy `OIDC_AUTO_LINK_USERS` ma wartość `true`, SnapOtter łączy tożsamość OIDC z istniejącym lokalnym kontem, jeśli adresy e-mail się zgadzają. Jest to przydatne, gdy masz wcześniej utworzone konta użytkowników i chcesz, aby zaczęli korzystać z SSO bez utraty swoich danych.

::: warning 
Włączaj automatyczne łączenie tylko wtedy, gdy ufasz, że Twój dostawca OIDC weryfikuje adresy e-mail. Niezweryfikowany e-mail mógłby pozwolić komuś na przejęcie konta innego użytkownika.
:::

### Wyłączanie logowania lokalnego {#disabling-local-login}

OIDC nie wyłącza lokalnego logowania nazwą użytkownika i hasłem. Obie metody pozostają dostępne. Administratorzy nadal mogą logować się przy użyciu danych lokalnych, jeśli dostawca OIDC jest nieosiągalny.

## Certyfikaty samopodpisane {#self-signed-certificates}

Jeśli Twój dostawca OIDC używa certyfikatu samopodpisanego lub z prywatnego CA, zamontuj pakiet CA w kontenerze i wskaż na niego `NODE_EXTRA_CA_CERTS`:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
Nie ustawiaj `NODE_TLS_REJECT_UNAUTHORIZED=0`. Wyłącza to całą weryfikację TLS i stanowi zagrożenie bezpieczeństwa.
:::

## Rozwiązywanie problemów {#troubleshooting}

### Niezgodność URI przekierowania {#redirect-uri-mismatch}

Najczęstszy błąd. Sprawdź te różnice między tym, czego oczekuje Twój dostawca, a tym, co wysyła SnapOtter:

- `http` kontra `https` - schemat musi się dokładnie zgadzać
- Końcowy ukośnik - niektórzy dostawcy są pod tym względem rygorystyczni
- Numer portu - dołącz port, jeśli jest niestandardowy
- Ścieżka - musi być `/api/auth/oidc/callback`

Sprawdź dokładnie `EXTERNAL_URL`. Musi zgadzać się z URL-em, który użytkownicy wpisują w przeglądarce.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

Dostawca OIDC używa certyfikatu, któremu Node.js nie ufa. Zobacz [Certyfikaty samopodpisane](#self-signed-certificates) powyżej.

### Błędy odchylenia zegara {#clock-skew-errors}

Jeśli zegar Twojego serwera i zegar dostawcy OIDC nie są zsynchronizowane, walidacja tokenu może się nie powieść. Zwiększ `OIDC_CLOCK_TOLERANCE` (domyślnie 30 sekund). Lepszym rozwiązaniem jest uruchomienie NTP na obu maszynach.

### „Dostawca OIDC nieosiągalny” {#oidc-provider-unreachable}

SnapOtter pobiera dokument discovery dostawcy przy starcie oraz podczas logowania. Sprawdź:

- Rozwiązywanie DNS z wnętrza kontenera Docker (`docker exec snapotter nslookup auth.example.com`)
- Reguły zapory między kontenerem a dostawcą
- Wartość `OIDC_ISSUER_URL` - musi być osiągalna z serwera, a nie tylko z Twojej przeglądarki

### Brakujące oświadczenia (claims) {#missing-claims}

Jeśli po zalogowaniu nazwy użytkowników lub adresy e-mail są puste, Twój dostawca może nie zwracać oczekiwanych oświadczeń. Zweryfikuj:

- Zakresy skonfigurowane w `OIDC_SCOPES` obejmują `profile` oraz `email`
- Dostawca jest skonfigurowany tak, aby dołączać oświadczenie określone w `OIDC_USERNAME_CLAIM` do tokenu ID
- Niektórzy dostawcy wymagają jawnej konfiguracji mappera/zakresu, aby udostępnić oświadczenia
