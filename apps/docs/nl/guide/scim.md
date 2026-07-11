---
description: "Stel SCIM 2.0-provisioning in om gebruikers en groepen vanuit je identity provider naar SnapOtter te synchroniseren. Behandelt Okta, Azure AD / Entra ID en aangepaste integraties."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 9c1e925bdb7c
---

# SCIM-provisioning {#scim-provisioning}

SnapOtter implementeert SCIM 2.0 (System for Cross-domain Identity Management) voor geautomatiseerde provisioning van gebruikers en groepen. Je identity provider kan gebruikersaccounts automatisch aanmaken, bijwerken, deactiveren en heractiveren, en groepslidmaatschappen synchroniseren.

::: tip Enterprise-functie
SCIM-provisioning vereist een **enterprise**-licentie met de `scim`-functie. Het is niet beschikbaar op het team-plan. Zonder de functie geven alle SCIM-eindpunten (behalve discovery) een 403 terug.
:::

## Vereisten {#prerequisites}

- Een draaiende SnapOtter-instance die bereikbaar is via een publieke URL
- Een enterprise-licentiesleutel met de `scim`-functie
- Beheerderstoegang tot SnapOtter (de `users:manage`-permissie is vereist om een SCIM-token te genereren of in te trekken)
- Beheerderstoegang tot de provisioning-instellingen van je identity provider

## Snelstart {#quick-start}

1. Genereer een SCIM-bearer-token:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Het antwoord bevat het token. Sla het meteen op; het kan niet opnieuw worden opgehaald.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. Configureer in je identity provider SCIM-provisioning met:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authenticatie**: Bearer-token (plak het token uit stap 1)

## Authenticatie {#authentication}

SCIM-eindpunten gebruiken een specifiek Bearer-token, los van gebruikerssessies en API-sleutels.

### Een token genereren {#generating-a-token}

`POST /api/v1/enterprise/scim/token` genereert een nieuw SCIM-token. Dit eindpunt vereist een geldige sessie met de `users:manage`-permissie.

Het token wordt precies één keer in platte tekst teruggegeven. SnapOtter slaat alleen een scrypt-hash op. Als je het token kwijtraakt, trek het dan in en genereer een nieuw token.

Er is telkens maar één SCIM-token actief. Een nieuw token genereren vervangt het vorige.

### Een token intrekken {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` trekt het huidige SCIM-token in. Dit eindpunt vereist ook `users:manage`.

### Rate limiting {#rate-limiting}

SCIM-eindpunten zijn per token beperkt tot 1000 verzoeken per minuut. Wie deze limiet overschrijdt, krijgt HTTP 429 terug.

## Ondersteunde resources {#supported-resources}

| SCIM-resource | SnapOtter-concept | Aanmaken | Lezen | Bijwerken | Verwijderen |
|---|---|---|---|---|---|
| User | Gebruikersaccount | Ja | Ja | Ja | Soft delete |
| Group | Team | Ja | Ja | Ja | Ja |

::: warning 
SCIM-groepen worden gekoppeld aan SnapOtter-**teams**, niet aan rollen. SCIM kan de rol van een gebruiker niet instellen. Alle via SCIM aangemaakte gebruikers krijgen de `user`-rol. Gebruik de SnapOtter-beheerdersinterface om de rol van een gebruiker te wijzigen.
:::

## Gebruikersbewerkingen {#user-operations}

### Gebruiker aanmaken {#create-user}

`POST /api/v1/scim/v2/Users`

Maakt een nieuw gebruikersaccount aan met `authProvider` ingesteld op `scim` en de `user`-rol. De gebruiker wordt toegewezen aan het Default-team. Als `active` `false` is, wordt de rol in plaats daarvan op `disabled` gezet.

Verplichte attributen: `userName`. Optioneel: `externalId`, `emails`, `active` (standaard `true`).

### Gebruikers weergeven en filteren {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Geeft een gepagineerde lijst van gebruikers terug. Ondersteunt de queryparameters `startIndex` en `count` (maximaal 200 resultaten per pagina).

Filteren ondersteunt alleen `eq` (gelijk aan), op deze attributen:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Andere filteroperatoren en attributen geven HTTP 400 terug.

### Gebruiker ophalen {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Geeft één gebruiker terug op basis van hun SnapOtter-gebruikers-ID.

### Gebruiker vervangen {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Vervangt de attributen van de gebruiker. Ondersteunt `userName`, `externalId`, `emails` en `active`. Wijzigingen van de gebruikersnaam worden gecontroleerd op conflicten (409 als de nieuwe gebruikersnaam al door een andere gebruiker in gebruik is).

### Gebruiker patchen {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Gedeeltelijke update met SCIM PatchOp. Ondersteunde bewerkingen:

| Bewerking | Paden |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Gelijk aan `replace` |
| `remove` | `externalId`, `emails` |

De paden `name.formatted` en `displayName` worden voor compatibiliteit geaccepteerd maar hebben geen blijvend effect (SnapOtter slaat geen aparte weergavenaam op).

Waardeloze `replace`-bewerkingen (waarbij de waarde een object is zonder een `path`) worden eveneens ondersteund, met de sleutels `userName`, `externalId`, `emails` en `active`.

### Gebruiker deactiveren (soft delete) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter verwijdert gebruikers niet definitief via SCIM. In plaats daarvan voert DELETE een zachte deactivatie uit:

1. De rol van de gebruiker wordt gewijzigd van de huidige waarde (bijv. `editor`) naar `disabled:editor`, waarbij de oorspronkelijke rol behouden blijft.
2. Het wachtwoord van de gebruiker wordt gewist.
3. Alle actieve sessies worden ingetrokken.
4. Alle API-sleutels worden ingetrokken.

De gebruiker kan niet meer inloggen of API-sleutels gebruiken. Hun gegevens (bestanden, geschiedenis) blijven behouden.

### Gebruiker heractiveren {#reactivate-user}

Om een eerder gedeactiveerde gebruiker te heractiveren, stuur je een `PUT`- of `PATCH`-verzoek met `active: true`. SnapOtter herstelt de oorspronkelijke rol van vóór de deactivatie (bijv. `disabled:editor` wordt weer `editor`). Als de oorspronkelijke rol niet kan worden bepaald, valt het terug op `user`.

::: details Voorbeeld: deactiveren en heractiveren via PATCH
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

## Groepsbewerkingen {#group-operations}

SCIM-groepen worden gekoppeld aan SnapOtter-teams. Een groep aanmaken maakt een team aan. Groepslidmaatschap bepaalt tot welk team een gebruiker behoort.

### Groep aanmaken {#create-group}

`POST /api/v1/scim/v2/Groups`

Verplicht: `displayName`. Optioneel: `members` (array van `{ value: userId }`).

### Groepen weergeven en filteren {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Filteren ondersteunt alleen `displayName eq "..."`. Gepagineerd met `startIndex` en `count` (maximaal 200 resultaten per pagina).

### Groep ophalen {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Groep vervangen {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Vervangt de groepsnaam en de volledige ledenlijst. Bestaande leden die niet in de nieuwe lijst staan, worden naar het Default-team verplaatst.

### Groep patchen {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Ondersteunt deze bewerkingen:

| Bewerking | Pad | Effect |
|---|---|---|
| `add` | `members` | Voegt gebruikers toe aan het team |
| `remove` | `members[value eq "userId"]` | Verplaatst de gebruiker naar het Default-team |
| `replace` | `displayName` | Hernoemt het team |
| `replace` | `members` | Vervangt alle leden (verwijderde leden gaan naar het Default-team) |

### Groep verwijderen {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Verwijdert het team. Alle leden van het verwijderde team worden naar het Default-team verplaatst. Gebruikers worden niet gedeactiveerd of verwijderd.

## IdP-configuratie {#idp-setup}

### Okta {#okta}

1. Open in de Okta-beheerconsole je SnapOtter-applicatie (of maak er een aan).
2. Ga naar het tabblad **Provisioning** en klik op **Configure API Integration**.
3. Vink **Enable API Integration** aan en voer in:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: Het hierboven gegenereerde SCIM-bearer-token
4. Klik op **Test API Credentials** en vervolgens op **Save**.
5. Schakel onder **Provisioning > To App** in:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. Configureer onder **Push Groups** welke Okta-groepen als SnapOtter-teams gesynchroniseerd moeten worden.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Ga in de Azure-portal naar je SnapOtter-enterprise-applicatie.
2. Ga naar **Provisioning** en stel **Provisioning Mode** in op **Automatic**.
3. Voer onder **Admin Credentials** in:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: Het hierboven gegenereerde SCIM-bearer-token
4. Klik op **Test Connection** en vervolgens op **Save**.
5. Configureer onder **Mappings** de attribuutmappings voor gebruikers en groepen. De standaardinstellingen werken meestal, maar controleer of `userName` naar wens aan `userPrincipalName` of `mail` wordt gekoppeld.
6. Stel **Provisioning Status** in op **On** en sla op.

Azure provisioneert gebruikers en groepen op een vaste synchronisatiecyclus (doorgaans elke 40 minuten).

## Discovery-eindpunten {#discovery-endpoints}

Deze drie eindpunten zijn zonder authenticatie beschikbaar en beschrijven de mogelijkheden van de SCIM-server:

| Eindpunt | Beschrijving |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Servermogelijkheden en ondersteunde functies |
| `GET /api/v1/scim/v2/Schemas` | Schema-definities voor User en Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Beschikbare resourcetypes (User, Group) |

De `ServiceProviderConfig` adverteert deze mogelijkheden:

| Functie | Ondersteund |
|---|---|
| Patch | Ja |
| Bulk | Nee |
| Filter | Ja (max. 200 resultaten, alleen de `eq`-operator) |
| Change password | Nee |
| Sort | Nee |
| ETag | Nee |

## Beperkingen {#limitations}

- **Filteren**: Alleen de `eq`-operator wordt ondersteund. Complexe filters, de operatoren `and`/`or`, `co` (bevat) en `sw` (begint met) zijn niet geïmplementeerd.
- **Bulkbewerkingen**: Niet ondersteund.
- **Sort en ETag**: Niet ondersteund.
- **Rollen**: SCIM kan geen SnapOtter-rollen toewijzen. Alle geprovisioneerde gebruikers krijgen de `user`-rol.
- **MAX_USERS**: De limiet van de omgevingsvariabele `MAX_USERS` wordt niet afgedwongen bij het aanmaken van SCIM-gebruikers. Als je het aantal gebruikers wilt beperken, beheer de toewijzingen dan in je IdP.
- **Eén token**: Er kan telkens maar één SCIM-token actief zijn. Als meerdere IdP's SCIM-toegang nodig hebben, moeten ze het token delen.
- **Groepen zijn teams**: SCIM-groepen komen overeen met teams, niet met rollen of permissiegroepen.

## Probleemoplossing {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Je licentie bevat de `scim`-functie niet, of er is geen licentie geconfigureerd. SCIM vereist een enterprise-plan-licentie. Controleer of `SNAPOTTER_LICENSE_KEY` is ingesteld en of de licentie de `scim`-functie bevat.

### 401 "Bearer token required" {#_401-bearer-token-required}

Het SCIM-verzoek bevatte geen `Authorization: Bearer <token>`-header. Controleer de provisioning-configuratie van je IdP.

### 401 "Invalid token" {#_401-invalid-token}

Het token komt niet overeen met de opgeslagen hash. Dit gebeurt als het token is ingetrokken en opnieuw gegenereerd. Werk het token bij in de provisioning-instellingen van je IdP.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Er is nog geen SCIM-token gegenereerd. Gebruik het `POST /api/v1/enterprise/scim/token`-eindpunt om er een aan te maken.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Er bestaat al een gebruiker met dezelfde gebruikersnaam. Dit kan gebeuren wanneer een IdP een mislukte aanmaak opnieuw probeert. Controleer op dubbele gebruikersnamen in het SnapOtter-beheerdersvenster.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

De IdP verstuurt meer dan 1000 verzoeken per minuut. Dit gebeurt doorgaans tijdens een grote eerste synchronisatie. De meeste IdP's proberen het automatisch opnieuw nadat het rate-limit-venster is gereset. Als het probleem aanhoudt, controleer dan het synchronisatie-interval van de provisioning van je IdP.

### Gebruikers gedeprovisioneerd maar niet uit de UI verwijderd {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE is een zachte deactivatie. Gedeactiveerde gebruikers verschijnen nog steeds in de beheerdersgebruikerslijst met een uitgeschakelde status. Dit is opzettelijk zo, zodat hun gegevens behouden blijven. Hun rol wordt weergegeven als `disabled:<original-role>`.
