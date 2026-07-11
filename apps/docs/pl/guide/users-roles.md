---
description: "Zarządzaj użytkownikami, wbudowanymi i niestandardowymi rolami, uprawnieniami, kluczami API, zespołami, sesjami i dziennikiem audytu w SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: a027a7b88d46
---

# Użytkownicy, role i uprawnienia {#users-roles-permissions}

SnapOtter dostarcza trzy wbudowane role, 17 szczegółowych uprawnień oraz obsługę ról niestandardowych z opcjonalną kontrolą dostępu per narzędzie. Ta strona omawia pełny model autoryzacji, zakresowanie kluczy API, zarządzanie zespołami i rejestrowanie audytu.

::: tip Powiązane strony
[OIDC / SSO](/pl/guide/oidc) | [SAML SSO](/pl/guide/saml) | [Provisioning SCIM](/pl/guide/scim) | [Bezpieczeństwo i hartowanie](/pl/guide/security)
:::

## Użytkownicy {#users}

### Tworzenie użytkowników {#creating-users}

Administratorzy mogą tworzyć użytkowników za pośrednictwem panelu administracyjnego lub punktu końcowego `POST /api/auth/register`. Każdy użytkownik ma nazwę użytkownika, rolę, przypisanie do zespołu oraz opcjonalny adres e-mail.

### Domyślny administrator {#default-admin}

Przy pierwszym uruchomieniu SnapOtter tworzy domyślne konto administratora. Dane uwierzytelniające pochodzą ze zmiennych środowiskowych:

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Nazwa użytkownika dla początkowego konta administratora |
| `DEFAULT_PASSWORD` | `admin` | Hasło dla początkowego konta administratora |

Domyślny administrator jest zobowiązany do zmiany hasła przy pierwszym logowaniu.

### Dostawcy uwierzytelniania {#authentication-providers}

Użytkownicy mogą uwierzytelniać się kilkoma metodami:

- **Lokalna** - nazwa użytkownika i hasło przechowywane w bazie danych SnapOtter
- **OIDC** - dowolny dostawca OpenID Connect (zobacz [OIDC / SSO](/pl/guide/oidc))
- **SAML** - dostawcy tożsamości SAML 2.0 (zobacz [SAML SSO](/pl/guide/saml))
- **SCIM** - automatyczny provisioning od dostawcy tożsamości (zobacz [Provisioning SCIM](/pl/guide/scim))

### Wyłączanie uwierzytelniania {#disabling-authentication}

Ustaw `AUTH_ENABLED=false`, aby całkowicie wyłączyć uwierzytelnianie. W tym trybie dla wszystkich żądań używany jest syntetyczny anonimowy użytkownik z rolą `admin`. Logowanie nie jest wymagane.

::: warning 
Wyłączenie uwierzytelniania przyznaje pełny dostęp administratora każdemu, kto może dotrzeć do instancji. Używaj tego wyłącznie w zaufanych środowiskach.
:::

## Wbudowane role {#built-in-roles}

SnapOtter zawiera trzy wbudowane role. Nie można ich modyfikować ani usuwać.

### Admin {#admin}

Wszystkie 17 uprawnień. Pełna kontrola nad instancją.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 uprawnień. Może używać wszystkich narzędzi oraz zarządzać wszystkimi plikami i potokami, ale nie ma dostępu do funkcji administracyjnych.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 uprawnień. Może używać narzędzi i zarządzać własnymi zasobami.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Wykaz uprawnień {#permissions-reference}

| Uprawnienie | Opis |
|---|---|
| `tools:use` | Użycie dowolnego narzędzia przetwarzania |
| `files:own` | Przeglądanie i zarządzanie własnymi plikami |
| `files:all` | Przeglądanie i zarządzanie plikami wszystkich użytkowników |
| `apikeys:own` | Tworzenie i zarządzanie własnymi kluczami API |
| `apikeys:all` | Przeglądanie kluczy API wszystkich użytkowników |
| `pipelines:own` | Tworzenie i zarządzanie własnymi potokami |
| `pipelines:all` | Przeglądanie i zarządzanie potokami wszystkich użytkowników |
| `settings:read` | Przeglądanie ustawień instancji |
| `settings:write` | Modyfikowanie ustawień instancji |
| `users:manage` | Tworzenie, aktualizowanie i usuwanie kont użytkowników |
| `teams:manage` | Tworzenie, aktualizowanie i usuwanie zespołów |
| `features:manage` | Instalowanie i zarządzanie pakietami funkcji AI |
| `system:health` | Dostęp do punktów końcowych kondycji i gotowości |
| `audit:read` | Przeglądanie dziennika audytu i listowanie ról |
| `compliance:manage` | Zarządzanie cyklem życia RODO i funkcjami zgodności |
| `webhooks:manage` | Konfigurowanie wychodzących webhooków |
| `security:manage` | Zarządzanie ustawieniami bezpieczeństwa (lista dozwolonych adresów IP, wymuszanie SSO) |

## Role niestandardowe {#custom-roles}

Administratorzy z uprawnieniem `security:manage` mogą tworzyć role niestandardowe za pośrednictwem panelu administracyjnego lub API ról. Listowanie ról wymaga `audit:read`.

### Tworzenie roli niestandardowej {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Nazwy ról muszą mieć 2-30 znaków, składać się z małych liter i cyfr z myślnikami i podkreśleniami.

### Uprawnienia zastrzeżone dla administratora {#admin-reserved-permissions}

Trzy uprawnienia są zastrzeżone dla wbudowanych ról i nie można ich przypisać rolom niestandardowym:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

API ról odrzuca każde żądanie zawierające te uprawnienia. Dostęp do nich ma tylko wbudowana rola `admin`.

### Uprawnienia na poziomie narzędzi {#tool-level-permissions}

Role niestandardowe mogą opcjonalnie ograniczać, do których narzędzi użytkownicy mają dostęp. Dostępne są dwa tryby:

| Tryb | Zachowanie | Wymóg licencji |
|---|---|---|
| `category` | Ograniczenie według modalności (obraz, wideo, audio, dokument, plik) | Brak (za darmo) |
| `tool` | Ograniczenie według identyfikatora poszczególnego narzędzia | Wymaga funkcji enterprise `per_tool_permissions` |

Gdy ustawiony jest tryb `tool`, ale funkcja enterprise nie jest dostępna, SnapOtter degraduje się łagodnie i zezwala na dostęp do wszystkich narzędzi.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### Usuwanie roli niestandardowej {#deleting-a-custom-role}

Gdy rola niestandardowa zostanie usunięta, wszyscy przypisani do niej użytkownicy są automatycznie przenoszeni do roli `user`.

## Zespoły {#teams}

Zespoły grupują użytkowników na potrzeby zarządzania przechowywaniem i retencją. Przy pierwszym uruchomieniu tworzony jest zespół `Default`.

| Pole | Typ | Opis |
|---|---|---|
| `name` | string | Unikatowa nazwa zespołu (1-50 znaków) |
| `storageQuota` | number | Limit przechowywania per zespół w bajtach (działa bez enterprise) |
| `retentionHours` | number | Automatyczne usuwanie danych wyjściowych po tylu godzinach (wymaga `team_retention_overrides`, enterprise) |
| `legalHold` | boolean | Zapobiega automatycznemu usuwaniu plików członków zespołu (wymaga `legal_hold`, enterprise) |

::: info 
Zespołu `Default` nie można usunąć. Zespołów, które nadal mają członków, nie można usunąć. Najpierw przenieś członków.
:::

## Klucze API {#api-keys}

Użytkownicy mogą generować klucze API do dostępu programowego. Każdy klucz używa prefiksu `si_` i jest wyświetlany tylko raz, w momencie utworzenia.

### Uprawnienia zakresowe {#scoped-permissions}

Klucze API mogą opcjonalnie nieść tablicę `permissions`. Gdy jest ustawiona, efektywne uprawnienia dla żądania stanowią **część wspólną** uprawnień roli użytkownika i uprawnień zakresowych klucza. Oznacza to, że klucz API nigdy nie może eskalować poza własne uprawnienia użytkownika.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### Wygasanie {#expiration}

Klucze akceptują opcjonalny znacznik czasu `expiresAt`. Wygasłe klucze są odrzucane w czasie uwierzytelniania.

## Dziennik audytu {#audit-log}

SnapOtter rejestruje zdarzenia istotne dla bezpieczeństwa w ustrukturyzowanym dzienniku audytu przechowywanym w tabeli bazy danych `audit_log`.

### Przeglądanie dziennika audytu {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Wymaga uprawnienia `audit:read`. Obsługuje stronicowanie (`page`, `limit`) oraz filtry (`action`, `ip`, `from`, `to`).

### Audytowanie operacji narzędzi {#tool-operation-auditing}

::: warning 
Zdarzenia `TOOL_EXECUTED` **nie** są rejestrowane domyślnie. Są opcjonalne poprzez jedną z dwóch ścieżek:

1. Ustaw ustawienie administratora `auditToolOperations` na `true`.
2. Posiadaj aktywną licencję z funkcją `audit_export` (dostępną zarówno w planie team, jak i enterprise).

Bez jednego z tych warunków poszczególne wykonania narzędzi nie są zapisywane w dzienniku audytu.
:::

### Eksportowanie {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Wymaga uprawnienia `audit:read` oraz funkcji enterprise `audit_export` (dostępnej zarówno w planie team, jak i enterprise). Obsługuje formaty CSV i JSON, filtrowane według `action`, `actorId`, `targetType`, `targetId`, `from` oraz `to`.

### Podpisywanie odporne na manipulacje {#tamper-resistant-signing}

Gdy jest włączone, każdy wpis dziennika audytu jest podpisywany kodem HMAC pochodzącym z `DATA_ENCRYPTION_KEY`. Wymaga to:

1. Ustawienia `DATA_ENCRYPTION_KEY` w Twoim środowisku.
2. Włączenia ustawienia administratora `tamperResistantAudit`.
3. Licencji enterprise z funkcją `tamper_resistant_audit`.

### Retencja {#retention}

Ustaw `AUDIT_RETENTION_DAYS`, aby automatycznie usuwać stare wpisy. Wartość domyślna to `0`, co oznacza, że wpisy są przechowywane bezterminowo.

### Wykaz zdarzeń {#event-reference}

| Zdarzenie | Kategoria |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Uwierzytelnianie |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Uwierzytelnianie |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Uwierzytelnianie |
| `LOGOUT` | Uwierzytelnianie |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Zarządzanie użytkownikami |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Zarządzanie użytkownikami |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Role |
| `API_KEY_CREATED`, `API_KEY_DELETED` | Klucze API |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Ustawienia |
| `FILE_UPLOADED`, `FILE_DELETED` | Pliki |
| `TOOL_EXECUTED` | Narzędzia (opcjonalne) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Zgodność |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Zgodność |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Konfiguracja |

## Zarządzanie sesjami {#session-management}

Sesje są oparte na plikach cookie, kontrolowane przez `SESSION_DURATION_HOURS` (domyślnie: 168 godzin / 7 dni).

### Zmiany ról unieważniają sesje {#role-changes-invalidate-sessions}

Gdy administrator zmienia rolę użytkownika, wszystkie aktywne sesje tego użytkownika są usuwane. Użytkownik musi zalogować się ponownie, aby przejąć swoje nowe uprawnienia.

### Zabezpieczenia {#safety-guards}

- **Ochrona ostatniego administratora**: ostatniego pozostałego administratora nie można zdegradować do niższej roli. API zwraca błąd, jeśli spróbujesz.
- **Zapobieganie samousunięciu**: administratorzy nie mogą usunąć własnego konta za pośrednictwem API.
