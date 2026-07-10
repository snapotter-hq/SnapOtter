---
description: "Jak wnieść wkład w SnapOtter. Zgłoszenia błędów, propozycje funkcji, pull requesty i wymagania CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: a9956b0f7920
---

# Wnoszenie wkładu {#contributing}

Dziękujemy za zainteresowanie wnoszeniem wkładu. Ten przewodnik opisuje, jak uczestniczyć, co akceptujemy i jak zacząć.

## Sposoby wnoszenia wkładu {#ways-to-contribute}

### Zgłoszenia (nie wymagają konfiguracji) {#issues-no-setup-required}

- **Zgłoszenia błędów** - Coś nie działa? Otwórz [zgłoszenie błędu](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) wraz z krokami do odtworzenia problemu.
- **Propozycje funkcji** - Masz pomysł? Rozpocznij [dyskusję](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas), aby społeczność mogła się wypowiedzieć i oddać na nią głos.
- **Problemy z tłumaczeniami** - Zauważyłeś błędne lub brakujące tłumaczenie? Otwórz [zgłoszenie dotyczące tłumaczenia](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Problemy z dokumentacją** - Coś jest nie tak w dokumentacji? Otwórz [zgłoszenie dotyczące dokumentacji](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Kod (wymaga CLA) {#code-requires-cla}

Akceptujemy pull requesty dotyczące:

| Typ | Proces |
|------|---------|
| Poprawki błędów | Otwórz PR bezpośrednio (podlinkuj zgłoszenie, jeśli istnieje) |
| Nowe tłumaczenia | Otwórz PR bezpośrednio (zobacz [Przewodnik po tłumaczeniach](/pl/guide/translations)) |
| Ulepszenia dokumentacji | Otwórz PR bezpośrednio |
| Ulepszenia pokrycia testami | Otwórz PR bezpośrednio |
| Nowe narzędzia lub funkcje | Najpierw rozpocznij [dyskusję](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas); opiekun projektu zamienia zatwierdzone pomysły w śledzone zgłoszenie, zanim zaczniesz pisać kod |
| Refaktoryzacje lub zmiany architektury | Najpierw rozpocznij [dyskusję](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) i poczekaj na akceptację opiekuna projektu, zanim zaczniesz pisać kod |

### Czego nie zaakceptujemy {#what-we-will-not-accept}

- Zmian w przepływach CI/CD, konfiguracji wydań lub konfiguracji lintera/kompilatora
- PR-ów bez podpisanej [Umowy licencyjnej współtwórcy](#contributor-license-agreement)
- PR-ów zmieniających ponad 400 wierszy (podziel dużą pracę na mniejsze PR-y)
- Funkcji, które nie zostały wcześniej przedyskutowane i zatwierdzone
- Zmian w `packages/ai/` bez wcześniejszej dyskusji

## Umowa licencyjna współtwórcy {#contributor-license-agreement}

Zanim będziemy mogli scalić Twój pierwszy PR, musisz podpisać naszą [Indywidualną umowę CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). Jest to wymóg jednorazowy.

**Dlaczego:** SnapOtter ma podwójną licencję (AGPLv3 + komercyjna). CLA daje nam prawo do dystrybucji Twojego wkładu na obu licencjach. Zachowujesz pełne prawa autorskie do swojej pracy.

**Jak:** Gdy otworzysz swój pierwszy PR, bot CLA Assistant doda komentarz z odnośnikiem. Kliknij go, zapoznaj się z umową i podpisz ją za pomocą swojego konta GitHub. Zajmuje to 30 sekund.

Jeśli wnosisz wkład w imieniu swojego pracodawcy, a pracodawca zachowuje prawa własności intelektualnej do Twojej pracy, skontaktuj się z contact@snapotter.com, aby przygotować firmową umowę CLA przed przesłaniem wkładu.

## Pierwsze kroki {#getting-started}

### Wymagania wstępne {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (tylko dla narzędzi AI)
- Docker (opcjonalnie, do pełnego testowania integracyjnego)

### Konfiguracja {#setup}

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

### Uruchamianie sprawdzeń {#running-checks}

Przed przesłaniem PR-a upewnij się, że wszystkie sprawdzenia przechodzą lokalnie:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Proces pull requesta {#pull-request-process}

1. Sforkuj repozytorium i utwórz gałąź z `main` (`feat/my-feature` lub `fix/issue-123`)
2. Wprowadź zmiany w skupionych, łatwych do przejrzenia commitach, używając [konwencjonalnych commitów](https://www.conventionalcommits.org/)
3. Dodaj lub zaktualizuj testy dla swoich zmian
4. Uruchom `pnpm lint && pnpm typecheck && pnpm test` lokalnie
5. Otwórz PR względem `main` i wypełnij szablon
6. Podpisz CLA, jeśli zostaniesz o to poproszony
7. Poczekaj, aż CI przejdzie, a opiekun projektu przejrzy zmiany

### Czego oczekiwać podczas przeglądu {#review-expectations}

- Staramy się odpowiadać na PR-y w ciągu 7 dni
- Małe, skupione PR-y są przeglądane szybciej
- Jeśli nie otrzymasz odpowiedzi w ciągu 7 dni, zostaw komentarz przywołujący wątek
- Możemy poprosić o zmiany, zasugerować inne podejście lub zamknąć PR, jeśli nie jest zgodny z kierunkiem projektu

### Po scaleniu Twojego PR-a {#after-your-pr-is-merged}

Twój wkład zostanie uwzględniony w kolejnym wydaniu i wymieniony w dzienniku zmian.

## Dobre pierwsze zgłoszenia {#good-first-issues}

Szukasz czegoś do zrobienia? Sprawdź nasze [dobre pierwsze zgłoszenia](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) w poszukiwaniu zadań przyjaznych dla początkujących lub [potrzebna pomoc](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) w przypadku większych zadań, przy których docenimy pomoc społeczności.

## Styl kodu {#code-style}

- Biome zajmuje się formatowaniem i lintowaniem (cudzysłowy podwójne, średniki, wcięcie 2 spacje)
- Hook pre-commit automatycznie uruchamia `biome check --write` na plikach ze staging
- Jeśli linter zgłasza uwagi, popraw kod (nie modyfikuj konfiguracji Biome)
- Moduły ES wszędzie (`import`/`export`)
- Konwencjonalne commity: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Pełne informacje o architekturze znajdziesz w [Przewodniku dla programistów](/pl/guide/developer).

## Bezpieczeństwo {#security}

**Nie otwieraj publicznego PR-a ani zgłoszenia dla luk bezpieczeństwa.** Zgłaszaj je prywatnie poprzez [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) lub e-mailem na contact@snapotter.com. Pełne szczegóły znajdziesz w [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md).

## Pytania? {#questions}

- [Dokumentacja](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
