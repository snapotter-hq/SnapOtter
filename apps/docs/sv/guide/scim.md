---
description: "Konfigurera SCIM 2.0-provisionering för att synkronisera användare och grupper från din identitetsleverantör till SnapOtter. Täcker Okta, Azure AD / Entra ID och anpassade integrationer."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 17d440079ffa
---

# SCIM-provisionering {#scim-provisioning}

SnapOtter implementerar SCIM 2.0 (System for Cross-domain Identity Management) för automatiserad provisionering av användare och grupper. Din identitetsleverantör kan skapa, uppdatera, inaktivera och återaktivera användarkonton och synkronisera gruppmedlemskap automatiskt.

::: tip Enterprise-funktion
SCIM-provisionering kräver en **enterprise**-licens med funktionen `scim`. Den är inte tillgänglig i team-planen. Utan funktionen returnerar alla SCIM-slutpunkter (utom discovery) 403.
:::

## Förutsättningar {#prerequisites}

- En körande SnapOtter-instans nåbar på en publik URL
- En enterprise-licensnyckel med funktionen `scim`
- Administratörsåtkomst till SnapOtter (behörigheten `users:manage` krävs för att generera eller återkalla en SCIM-token)
- Administratörsåtkomst till din identitetsleverantörs provisioneringsinställningar

## Snabbstart {#quick-start}

1. Generera en SCIM-bearer-token:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Svaret innehåller token. Spara den omedelbart; den kan inte hämtas igen.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. Konfigurera SCIM-provisionering i din identitetsleverantör med:
   - **Bas-URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Autentisering**: Bearer-token (klistra in token från steg 1)

## Autentisering {#authentication}

SCIM-slutpunkter använder en dedikerad Bearer-token, separat från användarsessioner och API-nycklar.

### Generera en token {#generating-a-token}

`POST /api/v1/enterprise/scim/token` genererar en ny SCIM-token. Denna slutpunkt kräver en giltig session med behörigheten `users:manage`.

Token returneras i klartext exakt en gång. SnapOtter lagrar endast en scrypt-hash. Om du tappar bort token, återkalla den och generera en ny.

Endast en SCIM-token är aktiv åt gången. Att generera en ny token ersätter den föregående.

### Återkalla en token {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` återkallar den aktuella SCIM-token. Denna slutpunkt kräver också `users:manage`.

### Hastighetsbegränsning {#rate-limiting}

SCIM-slutpunkter är hastighetsbegränsade till 1000 förfrågningar per minut per token. Att överskrida denna gräns returnerar HTTP 429.

## Stödda resurser {#supported-resources}

| SCIM-resurs | SnapOtter-koncept | Skapa | Läsa | Uppdatera | Radera |
|---|---|---|---|---|---|
| User | Användarkonto | Ja | Ja | Ja | Mjuk radering |
| Group | Team | Ja | Ja | Ja | Ja |

::: warning 
SCIM-grupper mappar till SnapOtter-**team**, inte roller. SCIM kan inte ange en användares roll. Alla användare som skapas via SCIM tilldelas rollen `user`. För att ändra en användares roll, använd SnapOtters administratörsgränssnitt.
:::

## Användaroperationer {#user-operations}

### Skapa användare {#create-user}

`POST /api/v1/scim/v2/Users`

Skapar ett nytt användarkonto med `authProvider` satt till `scim` och rollen `user`. Användaren tilldelas Default-teamet. Om `active` är `false` sätts rollen till `disabled` istället.

Obligatoriska attribut: `userName`. Valfria: `externalId`, `emails`, `active` (standard `true`).

### Lista och filtrera användare {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Returnerar en paginerad lista över användare. Stöder frågeparametrarna `startIndex` och `count` (maximalt 200 resultat per sida).

Filtrering stöder endast `eq` (lika med), på dessa attribut:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Andra filteroperatorer och attribut returnerar HTTP 400.

### Hämta användare {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Returnerar en enskild användare via deras SnapOtter-användar-ID.

### Ersätt användare {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Ersätter användarens attribut. Stöder `userName`, `externalId`, `emails` och `active`. Användarnamnsändringar kontrolleras för konflikter (409 om det nya användarnamnet redan används av en annan användare).

### Patcha användare {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Partiell uppdatering med SCIM PatchOp. Stödda operationer:

| Operation | Sökvägar |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Samma som `replace` |
| `remove` | `externalId`, `emails` |

Sökvägarna `name.formatted` och `displayName` accepteras för kompatibilitet men har ingen bestående effekt (SnapOtter lagrar inte ett separat visningsnamn).

Valuelösa `replace`-operationer (där värdet är ett objekt utan `path`) stöds också, med nycklarna `userName`, `externalId`, `emails` och `active`.

### Inaktivera användare (mjuk radering) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter hårdraderar inte användare via SCIM. Istället utför DELETE en mjuk inaktivering:

1. Användarens roll ändras från sitt aktuella värde (t.ex. `editor`) till `disabled:editor`, vilket bevarar den ursprungliga rollen.
2. Användarens lösenord rensas.
3. Alla aktiva sessioner återkallas.
4. Alla API-nycklar återkallas.

Användaren kan inte längre logga in eller använda några API-nycklar. Deras data (filer, historik) behålls.

### Återaktivera användare {#reactivate-user}

För att återaktivera en tidigare inaktiverad användare, skicka en `PUT`- eller `PATCH`-förfrågan med `active: true`. SnapOtter återställer den ursprungliga rollen från före inaktiveringen (t.ex. blir `disabled:editor` `editor` igen). Om den ursprungliga rollen inte kan fastställas faller den tillbaka på `user`.

::: details Exempel: inaktivera och återaktivera via PATCH
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

## Gruppoperationer {#group-operations}

SCIM-grupper mappar till SnapOtter-team. Att skapa en grupp skapar ett team. Gruppmedlemskap styr vilket team en användare tillhör.

### Skapa grupp {#create-group}

`POST /api/v1/scim/v2/Groups`

Obligatoriskt: `displayName`. Valfritt: `members` (array av `{ value: userId }`).

### Lista och filtrera grupper {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Filtrering stöder endast `displayName eq "..."`. Paginerad med `startIndex` och `count` (maximalt 200 resultat per sida).

### Hämta grupp {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Ersätt grupp {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Ersätter gruppnamnet och hela medlemslistan. Befintliga medlemmar som inte finns i den nya listan flyttas till Default-teamet.

### Patcha grupp {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Stöder dessa operationer:

| Operation | Sökväg | Effekt |
|---|---|---|
| `add` | `members` | Lägger till användare i teamet |
| `remove` | `members[value eq "userId"]` | Flyttar användaren till Default-teamet |
| `replace` | `displayName` | Byter namn på teamet |
| `replace` | `members` | Ersätter alla medlemmar (borttagna medlemmar flyttas till Default-teamet) |

### Radera grupp {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Raderar teamet. Alla medlemmar i det raderade teamet flyttas till Default-teamet. Användare inaktiveras eller raderas inte.

## IdP-konfiguration {#idp-setup}

### Okta {#okta}

1. Öppna din SnapOtter-applikation i Okta-administratörskonsolen (eller skapa en).
2. Gå till fliken **Provisioning** och klicka på **Configure API Integration**.
3. Kryssa i **Enable API Integration** och ange:
   - **Bas-URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API-token**: SCIM-bearer-token som genererades ovan
4. Klicka på **Test API Credentials** och sedan på **Save**.
5. Under **Provisioning > To App**, aktivera:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. Under **Push Groups**, konfigurera vilka Okta-grupper som ska synkroniseras som SnapOtter-team.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Gå till din SnapOtter enterprise-applikation i Azure-portalen.
2. Gå till **Provisioning** och sätt **Provisioning Mode** till **Automatic**.
3. Under **Admin Credentials**, ange:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: SCIM-bearer-token som genererades ovan
4. Klicka på **Test Connection** och sedan på **Save**.
5. Under **Mappings**, konfigurera attributmappningarna för användare och grupper. Standardvärdena fungerar vanligtvis, men verifiera att `userName` mappar till `userPrincipalName` eller `mail` som önskat.
6. Sätt **Provisioning Status** till **On** och spara.

Azure provisionerar användare och grupper på en fast synkroniseringscykel (vanligtvis var 40:e minut).

## Discovery-slutpunkter {#discovery-endpoints}

Dessa tre slutpunkter är tillgängliga utan autentisering och beskriver SCIM-serverns kapaciteter:

| Slutpunkt | Beskrivning |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Serverkapaciteter och stödda funktioner |
| `GET /api/v1/scim/v2/Schemas` | Schemadefinitioner för User och Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Tillgängliga resurstyper (User, Group) |

`ServiceProviderConfig` annonserar dessa kapaciteter:

| Funktion | Stöds |
|---|---|
| Patch | Ja |
| Bulk | Nej |
| Filter | Ja (max 200 resultat, endast operatorn `eq`) |
| Byt lösenord | Nej |
| Sortera | Nej |
| ETag | Nej |

## Begränsningar {#limitations}

- **Filtrering**: Endast operatorn `eq` stöds. Komplexa filter, operatorerna `and`/`or`, `co` (innehåller) och `sw` (börjar med) är inte implementerade.
- **Bulkoperationer**: Stöds inte.
- **Sortering och ETag**: Stöds inte.
- **Roller**: SCIM kan inte tilldela SnapOtter-roller. Alla provisionerade användare får rollen `user`.
- **MAX_USERS**: Gränsen från miljövariabeln `MAX_USERS` tillämpas inte vid SCIM-användarskapande. Om du behöver begränsa antalet användare, hantera tilldelningarna i din IdP.
- **En token**: Endast en SCIM-token kan vara aktiv åt gången. Om flera IdP:er behöver SCIM-åtkomst måste de dela token.
- **Grupper är team**: SCIM-grupper motsvarar team, inte roller eller behörighetsgrupper.

## Felsökning {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Din licens inkluderar inte funktionen `scim`, eller så är ingen licens konfigurerad. SCIM kräver en enterprise-planlicens. Verifiera att `SNAPOTTER_LICENSE_KEY` är satt och att licensen inkluderar funktionen `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

SCIM-förfrågan inkluderade inte en `Authorization: Bearer <token>`-header. Kontrollera din IdP:s provisioneringskonfiguration.

### 401 "Invalid token" {#_401-invalid-token}

Token matchar inte den lagrade hashen. Detta händer om token återkallades och genererades på nytt. Uppdatera token i din IdP:s provisioneringsinställningar.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Ingen SCIM-token har genererats ännu. Använd slutpunkten `POST /api/v1/enterprise/scim/token` för att skapa en.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

En användare med samma användarnamn finns redan. Detta kan hända när en IdP gör om ett misslyckat skapande. Kontrollera om det finns dubbletter av användarnamn i SnapOtters administratörspanel.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP:n skickar mer än 1000 förfrågningar per minut. Detta händer vanligtvis under en stor initial synkronisering. De flesta IdP:er gör automatiskt om försöket efter att hastighetsbegränsningsfönstret återställts. Om problemet kvarstår, kontrollera din IdP:s provisioneringssynkroniseringsintervall.

### Användare avprovisionerade men inte borttagna från gränssnittet {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE är en mjuk inaktivering. Inaktiverade användare visas fortfarande i administratörens användarlista med en inaktiverad status. Detta är avsiktligt så att deras data bevaras. Deras roll visas som `disabled:<original-role>`.
