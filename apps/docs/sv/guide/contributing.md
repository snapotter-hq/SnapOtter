---
description: "Så bidrar du till SnapOtter. Buggrapporter, funktionsförslag, pull requests och CLA-krav."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: f8b510a1881a
---

# Bidra {#contributing}

Tack för att du vill bidra. Den här guiden beskriver hur du deltar, vad vi accepterar och hur du kommer igång.

## Sätt att bidra {#ways-to-contribute}

### Ärenden (ingen konfiguration krävs) {#issues-no-setup-required}

- **Buggrapporter** - Något som är trasigt? Öppna en [buggrapport](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) med reproduktionssteg.
- **Funktionsförslag** - Har du en idé? Starta en [diskussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) så att gemenskapen kan väga in och rösta på den.
- **Översättningsproblem** - Hittade du en felaktig eller saknad översättning? Öppna ett [översättningsärende](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Dokumentationsproblem** - Något som inte stämmer i dokumentationen? Öppna ett [dokumentationsärende](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Kod (kräver CLA) {#code-requires-cla}

Vi accepterar pull requests för:

| Typ | Process |
|------|---------|
| Buggfixar | Öppna en PR direkt (länka ärendet om ett finns) |
| Nya översättningar | Öppna en PR direkt (se [Översättningsguide](/sv/guide/translations)) |
| Dokumentationsförbättringar | Öppna en PR direkt |
| Förbättrad testtäckning | Öppna en PR direkt |
| Nya verktyg eller funktioner | Starta en [diskussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) först; en underhållare omvandlar godkända idéer till ett spårat ärende innan du skriver kod |
| Refaktoreringar eller arkitekturändringar | Starta en [diskussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) först och invänta godkännande från en underhållare innan du skriver kod |

### Vad vi inte accepterar {#what-we-will-not-accept}

- Ändringar av CI/CD-arbetsflöden, release-konfiguration eller linter/kompilator-konfiguration
- PR:er utan ett signerat [Contributor License Agreement](#contributor-license-agreement)
- PR:er med över 400 rader ändring (dela upp stort arbete i mindre PR:er)
- Funktioner som inte först har diskuterats och godkänts
- Ändringar av `packages/ai/` utan föregående diskussion

## Contributor License Agreement {#contributor-license-agreement}

Innan vi kan slå samman din första PR måste du signera vårt [individuella CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). Det här är ett engångskrav.

**Varför:** SnapOtter är dubbellicensierat (AGPLv3 + kommersiellt). CLA:t ger oss rätten att distribuera dina bidrag under båda licenserna. Du behåller full upphovsrätt till ditt arbete.

**Hur:** När du öppnar din första PR kommenterar CLA Assistant-boten med en länk. Klicka på den, granska avtalet och signera med ditt GitHub-konto. Det tar 30 sekunder.

Om du bidrar för din arbetsgivares räkning och din arbetsgivare behåller de immateriella rättigheterna till ditt arbete, kontakta contact@snapotter.com för att ordna ett Corporate CLA innan du skickar in.

## Kom igång {#getting-started}

### Förutsättningar {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (endast för AI-verktyg)
- Docker (valfritt, för fullständig integrationstestning)

### Konfiguration {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### Köra kontroller {#running-checks}

Innan du skickar in en PR, se till att alla kontroller passerar lokalt:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Pull request-processen {#pull-request-process}

1. Forka repot och skapa en gren från `main` (`feat/my-feature` eller `fix/issue-123`)
2. Gör dina ändringar i fokuserade, granskningsbara commits med [conventional commits](https://www.conventionalcommits.org/)
3. Lägg till eller uppdatera tester för dina ändringar
4. Kör `pnpm lint && pnpm typecheck && pnpm test` lokalt
5. Öppna en PR mot `main` och fyll i mallen
6. Signera CLA:t om du uppmanas
7. Invänta att CI passerar och att en underhållare granskar

### Vad du kan förvänta dig av granskningen {#review-expectations}

- Vi strävar efter att svara på PR:er inom 7 dagar
- Små, fokuserade PR:er granskas snabbare
- Om du inte har hört något inom 7 dagar, lämna en kommentar som pingar tråden
- Vi kan begära ändringar, föreslå ett annat tillvägagångssätt eller stänga PR:en om den inte stämmer med projektets inriktning

### Efter att din PR har slagits samman {#after-your-pr-is-merged}

Ditt bidrag kommer att inkluderas i nästa release och krediteras i ändringsloggen.

## Bra första ärenden {#good-first-issues}

Letar du efter något att arbeta med? Kolla våra [bra första ärenden](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) för nybörjarvänliga uppgifter, eller [hjälp önskas](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) för större poster där vi skulle uppskatta hjälp från gemenskapen.

## Kodstil {#code-style}

- Biome sköter formatering och linting (dubbla citattecken, semikolon, 2 blanksteg indrag)
- Pre-commit-hooken kör `biome check --write` på stagade filer automatiskt
- Om lintern klagar, fixa koden (ändra inte Biome-konfigurationen)
- ES-moduler överallt (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

För fullständiga arkitekturdetaljer, se [Utvecklarguiden](/sv/guide/developer).

## Säkerhet {#security}

**Öppna inte en offentlig PR eller ett ärende för säkerhetssårbarheter.** Rapportera dem privat via [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) eller e-post contact@snapotter.com. Se [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) för fullständiga detaljer.

## Frågor? {#questions}

- [Dokumentation](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
