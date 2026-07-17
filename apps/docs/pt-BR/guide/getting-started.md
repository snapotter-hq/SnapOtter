---
description: "Instale o SnapOtter com Docker em um único comando. Inclui configuração de Docker Compose, build a partir do código-fonte e uma visão geral completa das features."
i18n_output_hash: 8584b5780f52
i18n_source_hash: 68bf7f60b68d
i18n_provenance: human
---

# Primeiros Passos {#getting-started}

::: tip Experimente antes de instalar
Explore a interface completa em [demo.snapotter.com](https://demo.snapotter.com) - sem cadastro ou instalação necessários.
:::

## Início Rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Este contêiner único roda tudo de que precisa: sem um `DATABASE_URL` definido, ele inicia seu próprio PostgreSQL e Redis na interface de loopback (modo embutido) e mantém todos os dados no volume `SnapOtter-data`. É a maneira mais rápida de experimentar o SnapOtter ou fazer self-host em um homelab. Para produção, rode a stack do [Docker Compose](#docker-compose) abaixo, que mantém o PostgreSQL e o Redis em seus próprios contêineres. O modo embutido roda como root (o padrão) e se desliga automaticamente assim que você define `DATABASE_URL`.

Vai instalar em um Raspberry Pi, um notebook antigo ou um VPS pequeno? Veja [Ambientes com Poucos Recursos](/pt-BR/guide/low-resource) para um passo a passo ajustado e o que esperar de hardware limitado.

Você será solicitado a trocar sua senha no primeiro login.

::: tip Analytics Anônimos de Produto
O SnapOtter inclui analytics de produto anônimos por padrão. Para desativá-los, abra **Configurações → Sistema → Privacidade** e desligue **Analytics Anônimos de Produto**. Eles param imediatamente para toda a instância.

Você também pode definir a variável de ambiente `SNAPOTTER_TELEMETRY=0` (`false` e `off` também funcionam) para desabilitar toda a telemetria da instância sem um rebuild.

O monitoramento de erros é fornecido pelo [Sentry](https://sentry.io), que patrocina o SnapOtter através do seu programa open-source.

Para detalhes sobre o que é coletado, veja [O que o SnapOtter coleta](/pt-BR/guide/telemetry).
:::

::: tip Aceleração NVIDIA CUDA
Adicione `--gpus all` para remoção de fundo, aumento de escala, aprimoramento de rosto e restauração acelerados por NVIDIA CUDA. OCR permanece baseado em CPU e funciona na mesma imagem com ou sem acesso GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requer o [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Faz fallback para CPU automaticamente quando o CUDA está indisponível. A aceleração por iGPU Intel/AMD através de VA-API, Quick Sync ou OpenCL não é suportada para inferência de IA no momento. Veja [Tags Docker](/pt-BR/guide/docker-tags) para benchmarks.
:::

::: details Também no GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Ambos os registries publicam a mesma imagem a cada release.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Veja [Configuração](/pt-BR/guide/configuration) para todas as variáveis de ambiente.

## Build a partir do Código-Fonte {#build-from-source}

**Pré-requisitos:** Node.js 22+, pnpm 9+, Docker (para Postgres + Redis), Python 3.10+ (para features de IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## O Que Você Pode Fazer {#what-you-can-do}

### Processamento de Arquivos (200+ Ferramentas) {#file-processing-200-tools}

| Modalidade | Contagem | Ferramentas de Exemplo |
|----------|-------|---------------|
| **Imagem** | 105 | Redimensionar, Recortar, Comprimir, Converter, Remover Fundo, Upscale, OCR, Marca d'água, Colagem, Colorizar, Ferramentas de GIF, presets de formato |
| **Vídeo** | 57 | Cortar, Recortar, Comprimir, Converter, Mesclar, Extrair Áudio, Legendas Automáticas, Vídeo para GIF, Redimensionar, Estabilizar, presets de formato |
| **Áudio** | 27 | Cortar, Mesclar, Converter, Normalizar, Redução de Ruído, Transcrever, Alteração de Pitch, Fade, Criador de Toques, presets de formato |
| **PDF / Documento** | 42 | Mesclar, Dividir, Comprimir, OCR, Marca d'água, Ocultar, Word para PDF, Excel para PDF, Girar, Proteger, Reparar |
| **Arquivos** | 10 | CSV para JSON, JSON para XML, Mesclar CSVs, Dividir CSV, Criar ZIP, Extrair ZIP, Criador de Gráficos, YAML/JSON |

### Pipelines {#pipelines}

Encadeie ferramentas em fluxos de trabalho de múltiplas etapas e aplique-os a uma imagem ou a um lote inteiro:

1. Abra **Pipelines** na barra lateral.
2. Adicione etapas (qualquer ferramenta, quaisquer configurações).
3. Rode em um único arquivo - ou em um lote inteiro de uma vez.
4. Salve o pipeline para reutilização posterior.

Os pipelines permitem 20 etapas por padrão. Defina `MAX_PIPELINE_STEPS=0` para tornar o limite ilimitado.

### Biblioteca de Arquivos {#file-library}

Cada arquivo que você processa pode ser salvo na sua biblioteca de **Arquivos**. O SnapOtter rastreia todo o histórico de versões para que você possa acompanhar cada etapa de processamento do upload original até a saída final.

Salvar é explícito: resultados que você salva na biblioteca são mantidos até você excluí-los, enquanto resultados que você processa e deixa sem salvar são limpos automaticamente após 72 horas (configurável via `FILE_MAX_AGE_HOURS`).

### API REST e Chaves de API {#rest-api-api-keys}

Toda ferramenta é acessível via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Gere chaves de API em **Configurações → Chaves de API**. Veja a [referência da API REST](/pt-BR/api/rest) para todos os endpoints, ou acesse [http://localhost:1349/api/docs](http://localhost:1349/api/docs) para a referência interativa.

### Multiusuário e Equipes {#multi-user-teams}

Habilite múltiplos usuários com controle de acesso baseado em papéis:

- **Admin**: acesso completo - gerenciar usuários, equipes, configurações, todos os arquivos/pipelines/chaves de API
- **Usuário**: usar ferramentas, gerenciar os próprios arquivos/pipelines/chaves de API

Crie equipes em **Configurações → Equipes** para agrupar usuários.

Defina `AUTH_ENABLED=true` (ou `false` para usuário único/uso próprio sem login).
