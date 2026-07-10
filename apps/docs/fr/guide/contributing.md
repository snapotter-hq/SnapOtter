---
description: "Comment contribuer à SnapOtter. Rapports de bugs, demandes de fonctionnalités, pull requests et exigences du CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: a3666655a942
---

# Contribuer {#contributing}

Merci de l'intérêt que vous portez à contribuer. Ce guide explique comment participer, ce que nous acceptons et comment démarrer.

## Façons de contribuer {#ways-to-contribute}

### Tickets (aucune configuration requise) {#issues-no-setup-required}

- **Rapports de bugs** - Quelque chose est cassé ? Ouvrez un [rapport de bug](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) avec les étapes de reproduction.
- **Demandes de fonctionnalités** - Vous avez une idée ? Lancez une [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) pour que la communauté puisse donner son avis et voter pour elle.
- **Problèmes de traduction** - Vous repérez une traduction erronée ou manquante ? Ouvrez un [ticket de traduction](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Problèmes de documentation** - Quelque chose cloche dans la documentation ? Ouvrez un [ticket de documentation](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Code (nécessite le CLA) {#code-requires-cla}

Nous acceptons les pull requests pour :

| Type | Processus |
|------|---------|
| Corrections de bugs | Ouvrez une PR directement (liez le ticket s'il en existe un) |
| Nouvelles traductions | Ouvrez une PR directement (voir le [Guide de traduction](/fr/guide/translations)) |
| Améliorations de la documentation | Ouvrez une PR directement |
| Améliorations de la couverture de tests | Ouvrez une PR directement |
| Nouveaux outils ou fonctionnalités | Lancez d'abord une [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) ; un mainteneur convertit les idées approuvées en un ticket suivi avant que vous n'écriviez du code |
| Refactorisations ou changements d'architecture | Lancez d'abord une [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) et attendez la validation d'un mainteneur avant d'écrire du code |

### Ce que nous n'accepterons pas {#what-we-will-not-accept}

- Les modifications des workflows CI/CD, de la configuration de release ou de la configuration du linter/compilateur
- Les PR sans [Accord de licence de contributeur](#contributor-license-agreement) signé
- Les PR de plus de 400 lignes de changement (découpez les gros travaux en PR plus petites)
- Les fonctionnalités qui n'ont pas été discutées et approuvées au préalable
- Les modifications de `packages/ai/` sans discussion préalable

## Accord de licence de contributeur {#contributor-license-agreement}

Avant que nous puissions fusionner votre première PR, vous devez signer notre [CLA individuel](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). C'est une exigence à faire une seule fois.

**Pourquoi :** SnapOtter est sous double licence (AGPLv3 + commerciale). Le CLA nous accorde le droit de distribuer vos contributions sous les deux licences. Vous conservez la pleine propriété du droit d'auteur sur votre travail.

**Comment :** Lorsque vous ouvrez votre première PR, le bot CLA Assistant publie un commentaire avec un lien. Cliquez dessus, relisez l'accord et signez avec votre compte GitHub. Cela prend 30 secondes.

Si vous contribuez pour le compte de votre employeur et que celui-ci conserve les droits de propriété intellectuelle sur votre travail, contactez contact@snapotter.com pour mettre en place un CLA d'entreprise avant de soumettre.

## Démarrage {#getting-started}

### Prérequis {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (uniquement pour les outils d'IA)
- Docker (facultatif, pour les tests d'intégration complets)

### Configuration {#setup}

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

### Exécuter les vérifications {#running-checks}

Avant de soumettre une PR, assurez-vous que toutes les vérifications passent en local :

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Processus de pull request {#pull-request-process}

1. Forkez le dépôt et créez une branche à partir de `main` (`feat/my-feature` ou `fix/issue-123`)
2. Effectuez vos modifications dans des commits ciblés et relisibles en utilisant les [commits conventionnels](https://www.conventionalcommits.org/)
3. Ajoutez ou mettez à jour les tests pour vos modifications
4. Exécutez `pnpm lint && pnpm typecheck && pnpm test` en local
5. Ouvrez une PR contre `main` et remplissez le modèle
6. Signez le CLA si on vous le demande
7. Attendez que la CI passe et qu'un mainteneur fasse sa relecture

### Attentes concernant la relecture {#review-expectations}

- Nous visons à répondre aux PR sous 7 jours
- Les PR petites et ciblées sont relues plus rapidement
- Si vous n'avez pas de nouvelles sous 7 jours, laissez un commentaire pour relancer le fil
- Nous pouvons demander des modifications, suggérer une approche différente ou fermer la PR si elle ne correspond pas à la direction du projet

### Une fois votre PR fusionnée {#after-your-pr-is-merged}

Votre contribution sera incluse dans la prochaine release et créditée dans le changelog.

## Bons premiers tickets {#good-first-issues}

Vous cherchez quelque chose sur quoi travailler ? Consultez nos [bons premiers tickets](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) pour des tâches adaptées aux débutants, ou [aide recherchée](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) pour des chantiers plus importants où l'aide de la communauté serait appréciée.

## Style de code {#code-style}

- Biome gère le formatage et le linting (guillemets doubles, points-virgules, indentation de 2 espaces)
- Le hook de pré-commit exécute automatiquement `biome check --write` sur les fichiers indexés
- Si le linter se plaint, corrigez le code (ne modifiez pas la configuration de Biome)
- Modules ES partout (`import`/`export`)
- Commits conventionnels : `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Pour tous les détails d'architecture, consultez le [Guide du développeur](/fr/guide/developer).

## Sécurité {#security}

**N'ouvrez pas de PR ou de ticket public pour les vulnérabilités de sécurité.** Signalez-les de manière privée via les [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) ou par e-mail à contact@snapotter.com. Consultez [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) pour tous les détails.

## Des questions ? {#questions}

- [Documentation](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
