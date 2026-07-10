---
description: "Як зробити внесок у SnapOtter. Звіти про помилки, запити на функції, pull request-и та вимоги CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: 12a7eac534af
---

# Внесок {#contributing}

Дякуємо за ваш інтерес до участі. Цей посібник описує, як брати участь, що ми приймаємо і як розпочати.

## Способи зробити внесок {#ways-to-contribute}

### Issue (не потребує налаштування) {#issues-no-setup-required}

- **Звіти про помилки** - Щось зламалося? Відкрийте [звіт про помилку](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) з кроками для відтворення.
- **Запити на функції** - Маєте ідею? Розпочніть [обговорення](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas), щоб спільнота могла висловитися та проголосувати за неї.
- **Проблеми з перекладом** - Помітили неправильний або відсутній переклад? Відкрийте [issue про переклад](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Проблеми з документацією** - Щось не так у документації? Відкрийте [issue про документацію](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Код (потребує CLA) {#code-requires-cla}

Ми приймаємо pull request-и для:

| Тип | Процес |
|------|---------|
| Виправлення помилок | Відкрийте PR напряму (посилайтеся на issue, якщо він існує) |
| Нові переклади | Відкрийте PR напряму (див. [Посібник з перекладу](/uk/guide/translations)) |
| Покращення документації | Відкрийте PR напряму |
| Покращення тестового покриття | Відкрийте PR напряму |
| Нові інструменти чи функції | Спершу розпочніть [обговорення](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas); мейнтейнер перетворює схвалені ідеї на відстежуваний issue, перш ніж ви почнете писати код |
| Рефакторинг або зміни архітектури | Спершу розпочніть [обговорення](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) і дочекайтеся схвалення мейнтейнера, перш ніж писати код |

### Що ми не приймемо {#what-we-will-not-accept}

- Зміни у робочих процесах CI/CD, конфігурації випусків або конфігурації лінтера/компілятора
- PR-и без підписаної [Угоди про ліцензування учасника](#contributor-license-agreement)
- PR-и з понад 400 рядками змін (розбийте велику роботу на менші PR-и)
- Функції, які не були попередньо обговорені та схвалені
- Зміни у `packages/ai/` без попереднього обговорення

## Угода про ліцензування учасника {#contributor-license-agreement}

Перш ніж ми зможемо влити ваш перший PR, ви маєте підписати нашу [Індивідуальну CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). Це одноразова вимога.

**Чому:** SnapOtter має подвійне ліцензування (AGPLv3 + комерційне). CLA надає нам право розповсюджувати ваші внески за обома ліцензіями. Ви зберігаєте повне авторське право на свою роботу.

**Як:** Коли ви відкриваєте свій перший PR, бот CLA Assistant залишить коментар із посиланням. Натисніть на нього, перегляньте угоду та підпишіть її своїм обліковим записом GitHub. Це займає 30 секунд.

Якщо ви робите внесок від імені свого роботодавця, і ваш роботодавець зберігає права інтелектуальної власності на вашу роботу, зверніться на contact@snapotter.com, щоб оформити корпоративну CLA перед надсиланням.

## Початок роботи {#getting-started}

### Передумови {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (лише для інструментів ШІ)
- Docker (необов'язково, для повного інтеграційного тестування)

### Налаштування {#setup}

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

### Запуск перевірок {#running-checks}

Перед надсиланням PR переконайтеся, що всі перевірки проходять локально:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Процес pull request-а {#pull-request-process}

1. Зробіть форк репозиторію та створіть гілку від `main` (`feat/my-feature` або `fix/issue-123`)
2. Внесіть зміни зосередженими, придатними до рецензування комітами, використовуючи [conventional commits](https://www.conventionalcommits.org/)
3. Додайте або оновіть тести для своїх змін
4. Запустіть `pnpm lint && pnpm typecheck && pnpm test` локально
5. Відкрийте PR проти `main` і заповніть шаблон
6. Підпишіть CLA, якщо буде запропоновано
7. Дочекайтеся проходження CI та рецензії від мейнтейнера

### Очікування щодо рецензування {#review-expectations}

- Ми прагнемо відповідати на PR-и протягом 7 днів
- Невеликі, зосереджені PR-и рецензуються швидше
- Якщо ви не отримали відповіді протягом 7 днів, залиште коментар, згадавши тред
- Ми можемо попросити внести зміни, запропонувати інший підхід або закрити PR, якщо він не відповідає напрямку проєкту

### Після того, як ваш PR влито {#after-your-pr-is-merged}

Ваш внесок буде включено до наступного випуску та зазначено у списку змін.

## Хороші перші issue {#good-first-issues}

Шукаєте, над чим попрацювати? Перегляньте наші [хороші перші issue](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) для завдань, зручних для початківців, або [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) для більших завдань, де ми будемо вдячні за допомогу спільноти.

## Стиль коду {#code-style}

- Biome відповідає за форматування та лінтинг (подвійні лапки, крапки з комою, відступ у 2 пробіли)
- Хук перед комітом автоматично запускає `biome check --write` на staged-файлах
- Якщо лінтер скаржиться, виправте код (не змінюйте конфігурацію Biome)
- ES-модулі всюди (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Повні деталі архітектури дивіться у [Посібнику для розробників](/uk/guide/developer).

## Безпека {#security}

**Не відкривайте публічний PR чи issue щодо вразливостей безпеки.** Повідомляйте про них приватно через [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) або на пошту contact@snapotter.com. Повні деталі дивіться у [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md).

## Питання? {#questions}

- [Документація](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
