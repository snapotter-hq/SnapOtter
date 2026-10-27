---
description: "Skonfiguruj provisioning SCIM 2.0, aby synchronizować użytkowników i grupy z Twojego dostawcy tożsamości do SnapOtter. Obejmuje Okta, Azure AD / Entra ID oraz integracje niestandardowe."
i18n_source_hash: 77ea64b4082e
i18n_provenance: human
i18n_output_hash: 3e85c8ef57fc
i18n_hash_version: 2
---

# Provisioning SCIM {#scim-provisioning}

SnapOtter implementuje SCIM 2.0 (System for Cross-domain Identity Management) do automatycznego provisioningu użytkowników i grup. Twój dostawca tożsamości może automatycznie tworzyć, aktualizować, dezaktywować i ponownie aktywować konta użytkowników oraz synchronizować członkostwo w grupach.

::: tip Funkcja enterprise
Provisioning SCIM wymaga licencji **enterprise** z funkcją `scim`. Nie jest dostępny w planie team. Bez tej funkcji wszystkie punkty końcowe SCIM (poza discovery) zwracają 403.
:::

## Wymagania wstępne {#prerequisites}

- Działająca instancja SnapOtter dostępna pod publicznym adresem URL
- Klucz licencji enterprise z funkcją `scim`
- Wbudowane konto SnapOtter `admin` z pełnym efektywnym zestawem uprawnień. Delegowana rola niestandardowa lub klucz API administratora, któremu brakuje uprawnień administratora, nie mogą wygenerować ani unieważnić globalnego tokena SCIM.
- Dostęp administracyjny do ustawień provisioningu Twojego dostawcy tożsamości

## Szybki start {#quick-start}

1. Wygeneruj token bearer SCIM:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Odpowiedź zawiera token. Zapisz go natychmiast; nie można go pobrać ponownie.

```json
{
  "token": "so_scim_v2_a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. W swoim dostawcy tożsamości skonfiguruj provisioning SCIM za pomocą:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Uwierzytelnianie**: token bearer (wklej token z kroku 1)

## Uwierzytelnianie {#authentication}

Punkty końcowe SCIM używają dedykowanego tokenu Bearer, odrębnego od sesji użytkowników i kluczy API.

### Generowanie tokenu {#generating-a-token}

`POST /api/v1/enterprise/scim/token` generuje nowy token SCIM. Ponieważ token może udostępniać i mutować użytkowników w całej instancji, ten punkt końcowy wymaga wbudowanej roli `admin` z pełnym efektywnym zestawem uprawnień administratora. Trzymanie `users:manage` w roli niestandardowej nie jest wystarczające.

Token jest zwracany w postaci jawnej dokładnie raz. SnapOtter przechowuje tylko hash scrypt. Jeśli utracisz token, odwołaj go i wygeneruj nowy.

Jednocześnie aktywny jest tylko jeden token SCIM. Wygenerowanie nowego tokenu zastępuje poprzedni.

::: warning Ponowne wydanie tokena po aktualizacji
Starsze, niewersjonowane tokeny SCIM są odrzucane. Po uaktualnieniu do wersji, która wystawia tokeny `so_scim_v2_...`, wygeneruj nowy token i zaktualizuj dostawcę tożsamości przed wznowieniem udostępniania.
:::

### Odwoływanie tokenu {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` unieważnia bieżący token SCIM. Ma te same pełne wbudowane wymagania administracyjne, co generowanie tokenów.

### Ograniczanie liczby żądań {#rate-limiting}

Punkty końcowe SCIM mają limit 1000 żądań na minutę na token. Przekroczenie tego limitu zwraca HTTP 429.

## Obsługiwane zasoby {#supported-resources}

| Zasób SCIM | Pojęcie w SnapOtter | Tworzenie | Odczyt | Aktualizacja | Usuwanie |
|---|---|---|---|---|---|
| User | Konto użytkownika | Tak | Tak | Tak | Miękkie usunięcie |
| Group | Zespół | Tak | Tak | Tak | Tak |

::: warning 
Grupy SCIM są mapowane na **zespoły** SnapOtter, a nie na role. SCIM nie może ustawić roli użytkownika. Wszyscy użytkownicy utworzeni przez SCIM otrzymują rolę `user`. Aby zmienić rolę użytkownika, użyj interfejsu administracyjnego SnapOtter.
:::

## Operacje na użytkownikach {#user-operations}

### Tworzenie użytkownika {#create-user}

`POST /api/v1/scim/v2/Users`

Tworzy nowe konto użytkownika z `authProvider` ustawionym na `scim` i rolą `user`. Użytkownik zostaje przypisany do zespołu Default. Jeśli `active` ma wartość `false`, rola jest zamiast tego ustawiana na `disabled`.

Wymagane atrybuty: `userName`. Opcjonalne: `externalId`, `emails`, `active` (domyślnie `true`).

### Wyświetlanie i filtrowanie użytkowników {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Zwraca stronicowaną listę użytkowników. Obsługuje parametry zapytania `startIndex` i `count` (maksymalnie 200 wyników na stronę).

Filtrowanie obsługuje tylko `eq` (równa się) na tych atrybutach:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Inne operatory filtrów i atrybuty zwracają HTTP 400.

### Pobieranie użytkownika {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Zwraca pojedynczego użytkownika według jego identyfikatora użytkownika SnapOtter.

### Zastępowanie użytkownika {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Zastępuje atrybuty użytkownika. Obsługuje `userName`, `externalId`, `emails` oraz `active`. Zmiany nazwy użytkownika są sprawdzane pod kątem konfliktów (409, jeśli nowa nazwa użytkownika jest zajęta przez innego użytkownika).

### Częściowa aktualizacja użytkownika {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Częściowa aktualizacja przy użyciu SCIM PatchOp. Obsługiwane operacje:

| Operacja | Ścieżki |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Tak samo jak `replace` |
| `remove` | `externalId`, `emails` |

Ścieżki `name.formatted` i `displayName` są akceptowane w celu zachowania zgodności, ale nie mają trwałego efektu (SnapOtter nie przechowuje osobnej nazwy wyświetlanej).

Obsługiwane są także operacje `replace` bez wartości (gdzie wartość jest obiektem bez `path`), z kluczami `userName`, `externalId`, `emails` oraz `active`.

### Dezaktywacja użytkownika (miękkie usunięcie) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter nie usuwa użytkowników trwale przez SCIM. Zamiast tego DELETE wykonuje miękką dezaktywację:

1. Rola użytkownika zostaje zmieniona z jej bieżącej wartości (np. `editor`) na `disabled:editor`, zachowując oryginalną rolę.
2. Hasło użytkownika zostaje wyczyszczone.
3. Wszystkie aktywne sesje zostają odwołane.
4. Wszystkie klucze API zostają odwołane.

Użytkownik nie może już się logować ani używać żadnych kluczy API. Jego dane (pliki, historia) są zachowywane.

### Ponowna aktywacja użytkownika {#reactivate-user}

Aby ponownie aktywować wcześniej dezaktywowanego użytkownika, wyślij żądanie `PUT` lub `PATCH` z `active: true`. SnapOtter przywraca oryginalną rolę sprzed dezaktywacji (np. `disabled:editor` ponownie staje się `editor`). Jeśli oryginalnej roli nie da się ustalić, następuje powrót do `user`.

::: details Przykład: dezaktywacja i ponowna aktywacja przez PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Operacje na grupach {#group-operations}

Grupy SCIM są mapowane na zespoły SnapOtter. Utworzenie grupy tworzy zespół. Członkostwo w grupie steruje tym, do którego zespołu należy użytkownik.

### Tworzenie grupy {#create-group}

`POST /api/v1/scim/v2/Groups`

Wymagane: `displayName`. Opcjonalne: `members` (tablica `{ value: userId }`).

### Wyświetlanie i filtrowanie grup {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Filtrowanie obsługuje tylko `displayName eq "..."`. Stronicowane za pomocą `startIndex` i `count` (maksymalnie 200 wyników na stronę).

### Pobieranie grupy {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Zastępowanie grupy {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Zastępuje nazwę grupy i pełną listę członków. Istniejący członkowie, których nie ma na nowej liście, zostają przeniesieni do zespołu Default.

### Częściowa aktualizacja grupy {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Obsługuje te operacje:

| Operacja | Ścieżka | Efekt |
|---|---|---|
| `add` | `members` | Dodaje użytkowników do zespołu |
| `remove` | `members[value eq "userId"]` | Przenosi użytkownika do zespołu Default |
| `replace` | `displayName` | Zmienia nazwę zespołu |
| `replace` | `members` | Zastępuje wszystkich członków (usunięci członkowie zostają przeniesieni do zespołu Default) |

### Usuwanie grupy {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Usuwa zespół. Wszyscy członkowie usuniętego zespołu zostają przeniesieni do zespołu Default. Użytkownicy nie są dezaktywowani ani usuwani.

## Konfiguracja IdP {#idp-setup}

### Okta {#okta}

1. W konsoli administracyjnej Okta otwórz swoją aplikację SnapOtter (lub ją utwórz).
2. Przejdź do zakładki **Provisioning** i kliknij **Configure API Integration**.
3. Zaznacz **Enable API Integration** i wprowadź:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: wygenerowany powyżej token bearer SCIM
4. Kliknij **Test API Credentials**, a następnie **Save**.
5. W sekcji **Provisioning > To App** włącz:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. W sekcji **Push Groups** skonfiguruj, które grupy Okta mają być synchronizowane jako zespoły SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. W portalu Azure przejdź do swojej aplikacji korporacyjnej SnapOtter.
2. Przejdź do **Provisioning** i ustaw **Provisioning Mode** na **Automatic**.
3. W sekcji **Admin Credentials** wprowadź:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: wygenerowany powyżej token bearer SCIM
4. Kliknij **Test Connection**, a następnie **Save**.
5. W sekcji **Mappings** skonfiguruj mapowania atrybutów użytkowników i grup. Wartości domyślne zwykle działają, ale sprawdź, czy `userName` jest zgodnie z oczekiwaniami mapowany na `userPrincipalName` lub `mail`.
6. Ustaw **Provisioning Status** na **On** i zapisz.

Azure prowadzi provisioning użytkowników i grup w stałym cyklu synchronizacji (zwykle co 40 minut).

## Punkty końcowe discovery {#discovery-endpoints}

Te trzy punkty końcowe są dostępne bez uwierzytelniania i opisują możliwości serwera SCIM:

| Punkt końcowy | Opis |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Możliwości serwera i obsługiwane funkcje |
| `GET /api/v1/scim/v2/Schemas` | Definicje schematów User i Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Dostępne typy zasobów (User, Group) |

`ServiceProviderConfig` ogłasza te możliwości:

| Funkcja | Obsługiwane |
|---|---|
| Patch | Tak |
| Bulk | Nie |
| Filter | Tak (maks. 200 wyników, tylko operator `eq`) |
| Zmiana hasła | Nie |
| Sort | Nie |
| ETag | Nie |

## Ograniczenia {#limitations}

- **Filtrowanie**: obsługiwany jest tylko operator `eq`. Filtry złożone, operatory `and`/`or`, `co` (zawiera) oraz `sw` (zaczyna się od) nie są zaimplementowane.
- **Operacje zbiorcze**: nieobsługiwane.
- **Sort i ETag**: nieobsługiwane.
- **Role**: SCIM nie może przypisywać ról SnapOtter. Wszyscy provisionowani użytkownicy otrzymują rolę `user`.
- **MAX_USERS**: limit zmiennej środowiskowej `MAX_USERS` nie jest egzekwowany przy tworzeniu użytkowników przez SCIM. Jeśli musisz ograniczyć liczbę użytkowników, zarządzaj przypisaniami w swoim IdP.
- **Jeden token**: jednocześnie aktywny może być tylko jeden token SCIM. Jeśli wiele IdP potrzebuje dostępu SCIM, muszą współdzielić ten token.
- **Grupy to zespoły**: grupy SCIM odpowiadają zespołom, a nie rolom czy grupom uprawnień.

## Rozwiązywanie problemów {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Twoja licencja nie zawiera funkcji `scim` albo nie skonfigurowano żadnej licencji. SCIM wymaga licencji planu enterprise. Sprawdź, czy `SNAPOTTER_LICENSE_KEY` jest ustawione, a licencja zawiera funkcję `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

Żądanie SCIM nie zawierało nagłówka `Authorization: Bearer <token>`. Sprawdź konfigurację provisioningu w swoim IdP.

### 401 "Invalid token" {#_401-invalid-token}

Token jest zniekształcony, używa wycofanego formatu niewersjonowanego lub nie pasuje do zapisanego skrótu. Wygeneruj aktualny token `so_scim_v2_...` i zaktualizuj token w ustawieniach udostępniania IdP.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Nie wygenerowano jeszcze żadnego tokenu SCIM. Użyj punktu końcowego `POST /api/v1/enterprise/scim/token`, aby go utworzyć.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Użytkownik o tej samej nazwie użytkownika już istnieje. Może się to zdarzyć, gdy IdP ponawia nieudane utworzenie. Sprawdź, czy w panelu administracyjnym SnapOtter nie ma zduplikowanych nazw użytkowników.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP wysyła ponad 1000 żądań na minutę. Zwykle dzieje się tak podczas dużej synchronizacji początkowej. Większość IdP automatycznie ponawia próbę po zresetowaniu okna limitu. Jeśli problem się utrzymuje, sprawdź interwał synchronizacji provisioningu swojego IdP.

### Użytkownicy zostali deprovisioned, ale nie usunięto ich z interfejsu {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE to miękka dezaktywacja. Dezaktywowani użytkownicy nadal pojawiają się na liście użytkowników administratora ze statusem wyłączony. Jest to działanie zamierzone, aby zachować ich dane. Ich rola jest wyświetlana jako `disabled:<original-role>`.

### Filtr `externalId` nie znajduje użytkownika logującego się przez OIDC lub SAML {#recover-scim-ids-in-oidc-or-saml-users}

Zanim `externalId` w SCIM dostał własną kolumnę (`users.scim_external_id`), operacja `PUT` lub `PATCH` w SCIM na użytkowniku, którego konto zostało już powiązane przez logowanie OIDC lub SAML, zapisywała identyfikator SCIM w tożsamości logowania tego użytkownika. Migracja przy aktualizacji nie potrafi odróżnić tej wartości od prawdziwego podmiotu OIDC ani NameID z SAML, więc pomija takich użytkowników. Dla nich `filter=externalId eq "..."` nic nie zwraca, dopóki IdP nie wyśle kolejnej aktualizacji zawierającej `externalId`.

Jeśli wolisz nie czekać na IdP, dziennik audytu może poświadczyć ten identyfikator. SCIM zapisuje wiersz `SCIM_USER_PROVISIONED` z `externalId`, z którym utworzył każdego użytkownika. Gdy korzystasz już z wydania zawierającego kolumnę `scim_external_id`, otwórz `psql` na bazie danych SnapOtter (w [przewodniku odzyskiwania konta](./account-recovery.md#older-images-and-fallbacks) pokazano, jak to zrobić dla obu konfiguracji) i podejrzyj użytkowników, których tożsamość logowania nadal równa się temu identyfikatorowi:

```sql
SELECT u.id, u.username, u.auth_provider, u.external_id AS scim_id
FROM users u
WHERE u.auth_provider IN ('oidc', 'saml')
  AND u.scim_external_id IS NULL
  AND btrim(u.external_id) <> ''
  AND EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.action = 'SCIM_USER_PROVISIONED'
      AND a.details->>'userId' = u.id
      AND a.details->>'externalId' = u.external_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM users o
    WHERE o.id <> u.id
      AND (o.scim_external_id = u.external_id
        OR (o.auth_provider IN ('oidc', 'saml') AND o.external_id = u.external_id))
  );
```

Jeśli lista wygląda dobrze, skopiuj identyfikator do kolumny SCIM. Uruchom to w `BEGIN;` i sprawdź zwrócone wiersze, zanim wykonasz `COMMIT;`:

```sql
UPDATE users u
SET scim_external_id = u.external_id, updated_at = now()
WHERE u.auth_provider IN ('oidc', 'saml')
  AND u.scim_external_id IS NULL
  AND btrim(u.external_id) <> ''
  AND EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.action = 'SCIM_USER_PROVISIONED'
      AND a.details->>'userId' = u.id
      AND a.details->>'externalId' = u.external_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM users o
    WHERE o.id <> u.id
      AND (o.scim_external_id = u.external_id
        OR (o.auth_provider IN ('oidc', 'saml') AND o.external_id = u.external_id))
  )
RETURNING u.id, u.username, u.scim_external_id;
```

Drugie uruchomienie nie dopasuje niczego. Aktualizacja pozostawia `external_id` bez zmian, ponieważ niektóre IdP (między innymi Okta) wysyłają ten sam identyfikator zarówno jako `sub` w OIDC, jak i `externalId` w SCIM, a dla nich wyczyszczenie go zepsułoby logowanie OIDC. Użytkownik, którego `external_id` naprawdę jest zabłąkanym identyfikatorem SCIM, już nie przechodzi dopasowania podmiotu. Przy włączonym `OIDC_AUTO_LINK_USERS` (lub `SAML_AUTO_LINK_USERS`) jego następne logowanie ze zweryfikowanym adresem e-mail i tak go ponownie powiąże.

Niektórzy użytkownicy pozostają poza zasięgiem i odzyskują identyfikator przy następnej aktualizacji z IdP:

- użytkownicy, których powiązanie logowania zastąpiło identyfikator SCIM i którzy nie otrzymali potem żadnego zapisu SCIM, ponieważ ich `external_id` nie pasuje już do wiersza audytu
- użytkownicy, których wiersz provisioningu został już usunięty przez retencję audytu
- użytkownicy, których `externalId` IdP zmienił po ich utworzeniu (wiersze aktualizacji zapisują, które pola się zmieniły, a nie ich wartości)
- dwóch użytkowników z tym samym identyfikatorem, których zapytanie pomija, aby unikalny indeks nie przerwał operacji; podgląd bez ostatniego warunku ich wylistuje, a to, do kogo należy identyfikator, jest twoją decyzją
