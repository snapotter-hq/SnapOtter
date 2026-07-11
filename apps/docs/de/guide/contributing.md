---
description: "Wie man zu SnapOtter beiträgt. Fehlerberichte, Feature-Anfragen, Pull Requests und CLA-Anforderungen."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: dad4aeee07c4
---

# Mitwirken {#contributing}

Vielen Dank für dein Interesse am Mitwirken. Dieser Leitfaden erklärt, wie du dich beteiligen kannst, was wir annehmen und wie du loslegst.

## Möglichkeiten zum Mitwirken {#ways-to-contribute}

### Issues (kein Setup erforderlich) {#issues-no-setup-required}

- **Fehlerberichte** - Etwas kaputt? Öffne einen [Fehlerbericht](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) mit Schritten zur Reproduktion.
- **Feature-Anfragen** - Hast du eine Idee? Starte eine [Diskussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas), damit die Community sich einbringen und dafür stimmen kann.
- **Übersetzungsprobleme** - Eine falsche oder fehlende Übersetzung entdeckt? Öffne ein [Übersetzungs-Issue](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Dokumentationsprobleme** - Etwas stimmt in der Dokumentation nicht? Öffne ein [Dokumentations-Issue](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Code (erfordert CLA) {#code-requires-cla}

Wir nehmen Pull Requests an für:

| Typ | Ablauf |
|------|---------|
| Fehlerbehebungen | Öffne direkt einen PR (verlinke das Issue, falls eines existiert) |
| Neue Übersetzungen | Öffne direkt einen PR (siehe [Übersetzungsleitfaden](/de/guide/translations)) |
| Verbesserungen an der Dokumentation | Öffne direkt einen PR |
| Verbesserungen der Testabdeckung | Öffne direkt einen PR |
| Neue Tools oder Features | Starte zuerst eine [Diskussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas); ein Maintainer überführt genehmigte Ideen in ein nachverfolgtes Issue, bevor du Code schreibst |
| Refactorings oder Architekturänderungen | Starte zuerst eine [Diskussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) und warte auf die Freigabe eines Maintainers, bevor du Code schreibst |

### Was wir nicht annehmen {#what-we-will-not-accept}

- Änderungen an CI/CD-Workflows, Release-Konfiguration oder Linter-/Compiler-Konfiguration
- PRs ohne unterzeichnete [Contributor License Agreement](#contributor-license-agreement)
- PRs mit mehr als 400 geänderten Zeilen (teile große Arbeiten in kleinere PRs auf)
- Features, die nicht zuvor besprochen und genehmigt wurden
- Änderungen an `packages/ai/` ohne vorherige Absprache

## Contributor License Agreement {#contributor-license-agreement}

Bevor wir deinen ersten PR mergen können, musst du unsere [Individual CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) unterzeichnen. Das ist eine einmalige Voraussetzung.

**Warum:** SnapOtter ist dual lizenziert (AGPLv3 + kommerziell). Die CLA gewährt uns das Recht, deine Beiträge unter beiden Lizenzen zu verbreiten. Du behältst das volle Urheberrecht an deiner Arbeit.

**Wie:** Wenn du deinen ersten PR öffnest, kommentiert der CLA-Assistant-Bot mit einem Link. Klicke darauf, prüfe die Vereinbarung und unterzeichne mit deinem GitHub-Konto. Das dauert 30 Sekunden.

Wenn du im Auftrag deines Arbeitgebers beiträgst und dein Arbeitgeber die IP-Rechte an deiner Arbeit behält, wende dich an contact@snapotter.com, um vor der Einreichung eine Corporate CLA zu vereinbaren.

## Erste Schritte {#getting-started}

### Voraussetzungen {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (nur für AI-Tools)
- Docker (optional, für vollständige Integrationstests)

### Setup {#setup}

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

### Prüfungen ausführen {#running-checks}

Stelle vor dem Einreichen eines PR sicher, dass alle Prüfungen lokal bestehen:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Ablauf eines Pull Requests {#pull-request-process}

1. Forke das Repository und erstelle einen Branch von `main` (`feat/my-feature` oder `fix/issue-123`)
2. Nimm deine Änderungen in fokussierten, überprüfbaren Commits mit [Conventional Commits](https://www.conventionalcommits.org/) vor
3. Füge Tests für deine Änderungen hinzu oder aktualisiere sie
4. Führe `pnpm lint && pnpm typecheck && pnpm test` lokal aus
5. Öffne einen PR gegen `main` und fülle die Vorlage aus
6. Unterzeichne die CLA, falls du dazu aufgefordert wirst
7. Warte, bis die CI besteht und ein Maintainer den PR prüft

### Was du bei der Prüfung erwarten kannst {#review-expectations}

- Wir bemühen uns, innerhalb von 7 Tagen auf PRs zu reagieren
- Kleine, fokussierte PRs werden schneller geprüft
- Wenn du nach 7 Tagen nichts gehört hast, hinterlasse einen Kommentar und pinge den Thread an
- Wir können Änderungen anfordern, einen anderen Ansatz vorschlagen oder den PR schließen, wenn er nicht zur Projektausrichtung passt

### Nachdem dein PR gemergt wurde {#after-your-pr-is-merged}

Dein Beitrag wird im nächsten Release enthalten sein und im Changelog vermerkt.

## Gute erste Issues {#good-first-issues}

Suchst du etwas, woran du arbeiten kannst? Sieh dir unsere [guten ersten Issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) für einsteigerfreundliche Aufgaben an oder [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) für größere Aufgaben, bei denen wir uns über Unterstützung aus der Community freuen.

## Codestil {#code-style}

- Biome übernimmt Formatierung und Linting (doppelte Anführungszeichen, Semikolons, Einrückung mit 2 Leerzeichen)
- Der Pre-Commit-Hook führt `biome check --write` automatisch auf gestagten Dateien aus
- Wenn der Linter meckert, behebe den Code (ändere nicht die Biome-Konfiguration)
- ES-Module überall (`import`/`export`)
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Vollständige Architekturdetails findest du im [Entwicklerleitfaden](/de/guide/developer).

## Sicherheit {#security}

**Öffne keinen öffentlichen PR oder kein öffentliches Issue für Sicherheitslücken.** Melde sie privat über [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) oder per E-Mail an contact@snapotter.com. Alle Details findest du in [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md).

## Fragen? {#questions}

- [Dokumentation](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
