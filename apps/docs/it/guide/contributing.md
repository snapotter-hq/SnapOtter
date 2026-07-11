---
description: "Come contribuire a SnapOtter. Segnalazioni di bug, richieste di funzionalità, pull request e requisiti CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: 9060b8d556c7
---

# Contribuire {#contributing}

Grazie per il tuo interesse a contribuire. Questa guida spiega come partecipare, cosa accettiamo e come iniziare.

## Modi per contribuire {#ways-to-contribute}

### Issue (nessuna configurazione richiesta) {#issues-no-setup-required}

- **Segnalazioni di bug** - Qualcosa non funziona? Apri una [segnalazione di bug](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) con i passaggi per riprodurlo.
- **Richieste di funzionalità** - Hai un'idea? Avvia una [discussione](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) così la community può valutarla e votarla.
- **Problemi di traduzione** - Hai notato una traduzione errata o mancante? Apri una [issue di traduzione](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Problemi nella documentazione** - Qualcosa non torna nella documentazione? Apri una [issue di documentazione](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Codice (richiede CLA) {#code-requires-cla}

Accettiamo pull request per:

| Tipo | Processo |
|------|---------|
| Correzioni di bug | Apri direttamente una PR (collega la issue se ne esiste una) |
| Nuove traduzioni | Apri direttamente una PR (vedi la [Guida alla traduzione](/it/guide/translations)) |
| Miglioramenti alla documentazione | Apri direttamente una PR |
| Miglioramenti alla copertura dei test | Apri direttamente una PR |
| Nuovi strumenti o funzionalità | Avvia prima una [discussione](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas); un manutentore converte le idee approvate in una issue tracciata prima che tu scriva il codice |
| Refactor o modifiche all'architettura | Avvia prima una [discussione](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) e attendi l'approvazione di un manutentore prima di scrivere il codice |

### Cosa non accetteremo {#what-we-will-not-accept}

- Modifiche ai workflow CI/CD, alla configurazione di rilascio o alla configurazione di linter/compilatore
- PR senza un [Contributor License Agreement](#contributor-license-agreement) firmato
- PR con oltre 400 righe di modifiche (suddividi il lavoro grande in PR più piccole)
- Funzionalità che non sono state prima discusse e approvate
- Modifiche a `packages/ai/` senza discussione preventiva

## Contributor License Agreement {#contributor-license-agreement}

Prima di poter unire la tua prima PR, devi firmare il nostro [CLA individuale](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). È un requisito una tantum.

**Perché:** SnapOtter è a doppia licenza (AGPLv3 + commerciale). Il CLA ci concede il diritto di distribuire i tuoi contributi con entrambe le licenze. Mantieni la piena titolarità del copyright sul tuo lavoro.

**Come:** Quando apri la tua prima PR, il bot CLA Assistant commenterà con un link. Fai clic, esamina l'accordo e firma con il tuo account GitHub. Bastano 30 secondi.

Se stai contribuendo per conto del tuo datore di lavoro e questi mantiene i diritti di proprietà intellettuale sul tuo lavoro, contatta contact@snapotter.com per stipulare un CLA aziendale prima di inviare.

## Come iniziare {#getting-started}

### Prerequisiti {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (solo per gli strumenti AI)
- Docker (facoltativo, per il test di integrazione completo)

### Configurazione {#setup}

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

### Esecuzione dei controlli {#running-checks}

Prima di inviare una PR, assicurati che tutti i controlli passino localmente:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Processo di pull request {#pull-request-process}

1. Effettua il fork del repo e crea un branch da `main` (`feat/my-feature` o `fix/issue-123`)
2. Apporta le tue modifiche in commit mirati e revisionabili usando i [conventional commit](https://www.conventionalcommits.org/)
3. Aggiungi o aggiorna i test per le tue modifiche
4. Esegui `pnpm lint && pnpm typecheck && pnpm test` localmente
5. Apri una PR verso `main` e compila il template
6. Firma il CLA se richiesto
7. Attendi che la CI passi e che un manutentore effettui la revisione

### Cosa aspettarsi dalla revisione {#review-expectations}

- Puntiamo a rispondere alle PR entro 7 giorni
- Le PR piccole e mirate vengono revisionate più velocemente
- Se non ricevi risposta entro 7 giorni, lascia un commento per richiamare l'attenzione sul thread
- Potremmo richiedere modifiche, suggerire un approccio diverso o chiudere la PR se non è in linea con la direzione del progetto

### Dopo che la tua PR è stata unita {#after-your-pr-is-merged}

Il tuo contributo sarà incluso nella prossima release e accreditato nel changelog.

## Prime issue adatte ai principianti {#good-first-issues}

Cerchi qualcosa su cui lavorare? Consulta le nostre [good first issue](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) per attività adatte ai principianti, oppure le [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) per attività più grandi in cui apprezzeremmo l'aiuto della community.

## Stile del codice {#code-style}

- Biome gestisce formattazione e linting (virgolette doppie, punto e virgola, indentazione di 2 spazi)
- L'hook pre-commit esegue automaticamente `biome check --write` sui file in stage
- Se il linter si lamenta, correggi il codice (non modificare la configurazione di Biome)
- Moduli ES ovunque (`import`/`export`)
- Conventional commit: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Per i dettagli completi sull'architettura, consulta la [Guida per sviluppatori](/it/guide/developer).

## Sicurezza {#security}

**Non aprire una PR o una issue pubblica per le vulnerabilità di sicurezza.** Segnalale privatamente tramite i [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) o via email a contact@snapotter.com. Vedi [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) per tutti i dettagli.

## Domande? {#questions}

- [Documentazione](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
