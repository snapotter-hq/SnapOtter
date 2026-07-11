---
description: "Como contribuir com o SnapOtter. Relatórios de bugs, solicitações de recursos, pull requests e requisitos do CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: a6f10e198b99
---

# Contribuindo {#contributing}

Obrigado pelo seu interesse em contribuir. Este guia cobre como participar, o que aceitamos e como começar.

## Formas de contribuir {#ways-to-contribute}

### Issues (sem configuração necessária) {#issues-no-setup-required}

- **Relatórios de bugs** - Algo quebrado? Abra um [relatório de bug](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) com passos de reprodução.
- **Solicitações de recursos** - Tem uma ideia? Comece uma [discussão](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) para que a comunidade possa opinar e votar nela.
- **Problemas de tradução** - Encontrou uma tradução errada ou faltando? Abra uma [issue de tradução](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Problemas de documentação** - Algo errado na documentação? Abra uma [issue de documentação](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Código (requer CLA) {#code-requires-cla}

Aceitamos pull requests para:

| Tipo | Processo |
|------|---------|
| Correções de bugs | Abra um PR diretamente (referencie a issue, se houver) |
| Novas traduções | Abra um PR diretamente (veja o [Guia de Tradução](/pt-BR/guide/translations)) |
| Melhorias na documentação | Abra um PR diretamente |
| Melhorias na cobertura de testes | Abra um PR diretamente |
| Novas ferramentas ou recursos | Comece uma [discussão](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) primeiro; um mantenedor converte ideias aprovadas em uma issue rastreada antes de você escrever código |
| Refatorações ou mudanças de arquitetura | Comece uma [discussão](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) primeiro e aguarde a aprovação de um mantenedor antes de escrever código |

### O que não aceitamos {#what-we-will-not-accept}

- Mudanças em workflows de CI/CD, configuração de release ou configuração do linter/compilador
- PRs sem um [Contributor License Agreement](#contributor-license-agreement) assinado
- PRs com mais de 400 linhas de alteração (divida trabalhos grandes em PRs menores)
- Recursos que não foram discutidos e aprovados antes
- Mudanças em `packages/ai/` sem discussão prévia

## Contributor License Agreement {#contributor-license-agreement}

Antes de podermos fazer merge do seu primeiro PR, você precisa assinar nosso [CLA Individual](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). Este é um requisito único.

**Por quê:** O SnapOtter tem licença dupla (AGPLv3 + comercial). O CLA nos concede o direito de distribuir suas contribuições sob ambas as licenças. Você mantém a titularidade total dos direitos autorais do seu trabalho.

**Como:** Quando você abrir seu primeiro PR, o bot CLA Assistant comentará com um link. Clique nele, revise o acordo e assine com sua conta do GitHub. Leva 30 segundos.

Se você está contribuindo em nome do seu empregador e ele detém os direitos de propriedade intelectual sobre seu trabalho, entre em contato com contact@snapotter.com para providenciar um CLA Corporativo antes de enviar.

## Começando {#getting-started}

### Pré-requisitos {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (apenas para ferramentas de IA)
- Docker (opcional, para testes de integração completos)

### Configuração {#setup}

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

### Executando as verificações {#running-checks}

Antes de enviar um PR, garanta que todas as verificações passem localmente:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Processo de pull request {#pull-request-process}

1. Faça um fork do repositório e crie um branch a partir de `main` (`feat/my-feature` ou `fix/issue-123`)
2. Faça suas mudanças em commits focados e revisáveis usando [conventional commits](https://www.conventionalcommits.org/)
3. Adicione ou atualize testes para suas mudanças
4. Execute `pnpm lint && pnpm typecheck && pnpm test` localmente
5. Abra um PR contra `main` e preencha o template
6. Assine o CLA se solicitado
7. Aguarde o CI passar e um mantenedor revisar

### Expectativas de revisão {#review-expectations}

- Buscamos responder a PRs em até 7 dias
- PRs pequenos e focados são revisados mais rápido
- Se você não tiver retorno em 7 dias, deixe um comentário marcando a thread
- Podemos solicitar mudanças, sugerir uma abordagem diferente ou fechar o PR se ele não estiver alinhado com a direção do projeto

### Depois que seu PR for mesclado {#after-your-pr-is-merged}

Sua contribuição será incluída no próximo release e creditada no changelog.

## Boas primeiras issues {#good-first-issues}

Procurando algo para trabalhar? Veja nossas [boas primeiras issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) para tarefas amigáveis a iniciantes, ou [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) para itens maiores em que agradeceríamos a ajuda da comunidade.

## Estilo de código {#code-style}

- O Biome cuida da formatação e do linting (aspas duplas, ponto e vírgula, indentação de 2 espaços)
- O hook de pre-commit executa `biome check --write` nos arquivos em stage automaticamente
- Se o linter reclamar, corrija o código (não modifique a configuração do Biome)
- Módulos ES em todos os lugares (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Para detalhes completos de arquitetura, veja o [Guia do Desenvolvedor](/pt-BR/guide/developer).

## Segurança {#security}

**Não abra um PR ou issue público para vulnerabilidades de segurança.** Reporte-as em privado através dos [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) ou por e-mail para contact@snapotter.com. Veja [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) para detalhes completos.

## Dúvidas? {#questions}

- [Documentação](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
