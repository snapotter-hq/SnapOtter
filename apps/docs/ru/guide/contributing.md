---
description: "Как участвовать в развитии SnapOtter. Отчёты об ошибках, запросы функций, pull request'ы и требования CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: fc5a31dca269
---

# Участие {#contributing}

Спасибо за интерес к участию в проекте. Это руководство описывает, как участвовать, что мы принимаем и с чего начать.

## Способы участия {#ways-to-contribute}

### Issues (без настройки) {#issues-no-setup-required}

- **Отчёты об ошибках** - Что-то сломалось? Откройте [отчёт об ошибке](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) с шагами воспроизведения.
- **Запросы функций** - Есть идея? Начните [обсуждение](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas), чтобы сообщество могло высказаться и проголосовать за неё.
- **Проблемы с переводом** - Заметили неверный или отсутствующий перевод? Откройте [issue о переводе](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Проблемы с документацией** - Что-то не так в документации? Откройте [issue о документации](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Код (требует CLA) {#code-requires-cla}

Мы принимаем pull request'ы для:

| Тип | Процесс |
|------|---------|
| Исправления ошибок | Откройте PR напрямую (сошлитесь на issue, если он есть) |
| Новые переводы | Откройте PR напрямую (см. [руководство по переводу](/ru/guide/translations)) |
| Улучшения документации | Откройте PR напрямую |
| Улучшения покрытия тестами | Откройте PR напрямую |
| Новые инструменты или функции | Сначала начните [обсуждение](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas); мейнтейнер превращает одобренные идеи в отслеживаемый issue до того, как вы начнёте писать код |
| Рефакторинг или изменения архитектуры | Сначала начните [обсуждение](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) и дождитесь одобрения мейнтейнера перед написанием кода |

### Что мы не принимаем {#what-we-will-not-accept}

- Изменения в CI/CD-пайплайнах, конфигурации релизов или конфигурации линтера/компилятора
- PR'ы без подписанного [Contributor License Agreement](#contributor-license-agreement)
- PR'ы с изменениями более чем на 400 строк (разбивайте большую работу на меньшие PR'ы)
- Функции, которые не были предварительно обсуждены и одобрены
- Изменения в `packages/ai/` без предварительного обсуждения

## Contributor License Agreement {#contributor-license-agreement}

Прежде чем мы сможем принять ваш первый PR, вы должны подписать наше [индивидуальное CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). Это одноразовое требование.

**Почему:** SnapOtter распространяется под двойной лицензией (AGPLv3 + коммерческая). CLA предоставляет нам право распространять ваш вклад под обеими лицензиями. Вы сохраняете полное авторское право на свою работу.

**Как:** Когда вы откроете свой первый PR, бот CLA Assistant оставит комментарий со ссылкой. Нажмите на неё, ознакомьтесь с соглашением и подпишите его своей учётной записью GitHub. Это займёт 30 секунд.

Если вы вносите вклад от имени работодателя и он сохраняет права на интеллектуальную собственность в отношении вашей работы, свяжитесь с contact@snapotter.com, чтобы оформить корпоративное CLA перед отправкой.

## Начало работы {#getting-started}

### Предварительные требования {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (только для AI-инструментов)
- Docker (опционально, для полного интеграционного тестирования)

### Настройка {#setup}

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

### Запуск проверок {#running-checks}

Перед отправкой PR убедитесь, что все проверки проходят локально:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Процесс pull request {#pull-request-process}

1. Сделайте форк репозитория и создайте ветку от `main` (`feat/my-feature` или `fix/issue-123`)
2. Вносите изменения сфокусированными, пригодными для ревью коммитами, используя [conventional commits](https://www.conventionalcommits.org/)
3. Добавьте или обновите тесты для своих изменений
4. Запустите `pnpm lint && pnpm typecheck && pnpm test` локально
5. Откройте PR против `main` и заполните шаблон
6. Подпишите CLA, если будет предложено
7. Дождитесь прохождения CI и ревью от мейнтейнера

### Ожидания по ревью {#review-expectations}

- Мы стремимся отвечать на PR'ы в течение 7 дней
- Небольшие, сфокусированные PR'ы проходят ревью быстрее
- Если вы не получили ответа в течение 7 дней, оставьте комментарий с упоминанием в треде
- Мы можем запросить изменения, предложить другой подход или закрыть PR, если он не соответствует направлению проекта

### После того как ваш PR будет принят {#after-your-pr-is-merged}

Ваш вклад войдёт в следующий релиз и будет упомянут в списке изменений.

## Хорошие первые задачи {#good-first-issues}

Ищете, над чем поработать? Загляните в наши [хорошие первые задачи](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22), подходящие для новичков, или в [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) для более крупных задач, где мы будем рады помощи сообщества.

## Стиль кода {#code-style}

- Biome отвечает за форматирование и линтинг (двойные кавычки, точки с запятой, отступ в 2 пробела)
- Pre-commit-хук автоматически запускает `biome check --write` на staged-файлах
- Если линтер ругается, исправляйте код (не изменяйте конфигурацию Biome)
- ES-модули везде (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Полные детали архитектуры смотрите в [руководстве разработчика](/ru/guide/developer).

## Безопасность {#security}

**Не открывайте публичный PR или issue для уязвимостей безопасности.** Сообщайте о них приватно через [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) или по email contact@snapotter.com. Полные детали смотрите в [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md).

## Вопросы? {#questions}

- [Документация](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
