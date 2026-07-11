---
description: "Hoe je kunt bijdragen aan SnapOtter. Bugmeldingen, functieverzoeken, pull requests en CLA-vereisten."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: fb98487dded5
---

# Bijdragen {#contributing}

Bedankt voor je interesse om bij te dragen. Deze gids beschrijft hoe je kunt meedoen, wat we accepteren en hoe je begint.

## Manieren om bij te dragen {#ways-to-contribute}

### Issues (geen installatie vereist) {#issues-no-setup-required}

- **Bugmeldingen** - Werkt er iets niet? Open een [bugmelding](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) met stappen om het te reproduceren.
- **Functieverzoeken** - Heb je een idee? Start een [discussie](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) zodat de community erop kan reageren en erop kan stemmen.
- **Vertaalproblemen** - Zie je een verkeerde of ontbrekende vertaling? Open een [vertaalprobleem](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Documentatieproblemen** - Klopt er iets niet in de documentatie? Open een [documentatieprobleem](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Code (vereist CLA) {#code-requires-cla}

We accepteren pull requests voor:

| Type | Proces |
|------|---------|
| Bugfixes | Open direct een PR (link de issue als die bestaat) |
| Nieuwe vertalingen | Open direct een PR (zie [Vertaalgids](/nl/guide/translations)) |
| Documentatieverbeteringen | Open direct een PR |
| Verbeteringen aan testdekking | Open direct een PR |
| Nieuwe tools of functies | Start eerst een [discussie](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas); een maintainer zet goedgekeurde ideeën om in een bijgehouden issue voordat je code schrijft |
| Refactors of architectuurwijzigingen | Start eerst een [discussie](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) en wacht op goedkeuring van een maintainer voordat je code schrijft |

### Wat we niet accepteren {#what-we-will-not-accept}

- Wijzigingen aan CI/CD-workflows, release-configuratie of linter-/compilerconfiguratie
- PR's zonder een ondertekende [Contributor License Agreement](#contributor-license-agreement)
- PR's met meer dan 400 gewijzigde regels (splits groot werk op in kleinere PR's)
- Functies die niet vooraf zijn besproken en goedgekeurd
- Wijzigingen aan `packages/ai/` zonder voorafgaand overleg

## Contributor License Agreement {#contributor-license-agreement}

Voordat we je eerste PR kunnen samenvoegen, moet je onze [Individual CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) ondertekenen. Dit is een eenmalige vereiste.

**Waarom:** SnapOtter heeft een duale licentie (AGPLv3 + commercieel). De CLA geeft ons het recht om je bijdragen onder beide licenties te verspreiden. Je behoudt het volledige auteursrecht op je werk.

**Hoe:** Wanneer je je eerste PR opent, plaatst de CLA Assistant-bot een reactie met een link. Klik erop, bekijk de overeenkomst en onderteken met je GitHub-account. Kost 30 seconden.

Als je bijdraagt namens je werkgever en je werkgever de IP-rechten op je werk behoudt, neem dan contact op met contact@snapotter.com om een Corporate CLA te regelen voordat je iets indient.

## Aan de slag {#getting-started}

### Vereisten {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (alleen voor AI-tools)
- Docker (optioneel, voor volledige integratietests)

### Installatie {#setup}

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

### Controles uitvoeren {#running-checks}

Zorg voordat je een PR indient dat alle controles lokaal slagen:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Pull request-proces {#pull-request-process}

1. Fork de repo en maak een branch aan vanaf `main` (`feat/my-feature` of `fix/issue-123`)
2. Breng je wijzigingen aan in gerichte, beoordeelbare commits met [conventional commits](https://www.conventionalcommits.org/)
3. Voeg tests toe of werk ze bij voor je wijzigingen
4. Voer `pnpm lint && pnpm typecheck && pnpm test` lokaal uit
5. Open een PR tegen `main` en vul het sjabloon in
6. Onderteken de CLA als daarom wordt gevraagd
7. Wacht tot CI slaagt en een maintainer het beoordeelt

### Beoordelingsverwachtingen {#review-expectations}

- We streven ernaar om binnen 7 dagen op PR's te reageren
- Kleine, gerichte PR's worden sneller beoordeeld
- Als je binnen 7 dagen niets hebt gehoord, plaats dan een reactie om de thread te pingen
- We kunnen wijzigingen vragen, een andere aanpak voorstellen of de PR sluiten als die niet aansluit bij de richting van het project

### Nadat je PR is samengevoegd {#after-your-pr-is-merged}

Je bijdrage wordt opgenomen in de volgende release en vermeld in de changelog.

## Goede eerste issues {#good-first-issues}

Op zoek naar iets om aan te werken? Bekijk onze [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) voor toegankelijke taken, of [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) voor grotere onderdelen waarbij we hulp uit de community waarderen.

## Codestijl {#code-style}

- Biome verzorgt de opmaak en linting (dubbele aanhalingstekens, puntkomma's, inspringen met 2 spaties)
- De pre-commit-hook voert `biome check --write` automatisch uit op gestagede bestanden
- Als de linter klaagt, pas dan de code aan (wijzig de Biome-configuratie niet)
- Overal ES-modules (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Zie voor volledige architectuurdetails de [Ontwikkelaarsgids](/nl/guide/developer).

## Beveiliging {#security}

**Open geen publieke PR of issue voor beveiligingslekken.** Meld ze privé via [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) of e-mail contact@snapotter.com. Zie [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) voor alle details.

## Vragen? {#questions}

- [Documentatie](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
