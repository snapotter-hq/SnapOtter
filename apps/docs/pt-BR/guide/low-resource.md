---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 507cd5624773
---
# Ambientes com Poucos Recursos {#low-resource-setups}

O SnapOtter roda bem em hardware modesto: um Raspberry Pi 4 ou 5, um notebook antigo ou um VPS de 2 GB. Esta página é o guia prático para essas máquinas: o que esperar, uma configuração pronta para copiar e colar com limites sensatos e quais features pular. Os dados completos de benchmark por trás desses números estão em [Requisitos de Hardware](/pt-BR/guide/deployment#hardware-requirements).

Antes de tudo, duas restrições rígidas:

- **Apenas 64 bits.** A imagem é construída para `linux/amd64` e `linux/arm64`. ARM de 32 bits (`armv7`/`armhf`) não é suportado, então os Pis de primeira geração e a família Pi Zero ficam de fora.
- **Piso de memória de 2 GB.** Com 512 MB a stack nem inicia, e 1 GB falha em lotes com vários arquivos. 2 GB com 2 núcleos é a menor configuração que funciona com folga.

## O que roda bem em hardware modesto {#what-runs-well}

Toda ferramenta sem IA funciona em uma máquina de 2 GB / 2 núcleos: as seções de Imagem e Arquivos inteiras, as ferramentas de PDF e as operações de vídeo e áudio por stream-copy (cortar, silenciar, remux de contêiner). A maioria termina em menos de um segundo.

Duas cargas de trabalho são as exceções:

- **Recodificação de vídeo** (converter entre codecs) é limitada pela CPU. Um clipe 1080p que leva ~40 s em uma CPU de desktop rápida pode levar vários minutos em uma CPU da classe do Pi. As operações de stream-copy continuam instantâneas.
- **Ferramentas de IA** precisam de RAM (4 GB recomendados) e disco (os bundles maiores têm 4-5 GB cada), e as pesadas (upscale, restauração de fotos, remoção de fundo) não são práticas em CPUs da classe do Pi. IA leve, como detecção de rosto e OCR, é utilizável se você tiver memória para isso.

Nenhuma das duas é instalada ou fica rodando a menos que você a use: sem bundles de IA instalados, o aplicativo fica ocioso em torno de 360 MB, e os bundles de IA só são baixados quando um admin os habilita.

## Passo a passo para Raspberry Pi / notebook antigo {#walkthrough}

Esta é a instalação padrão com Compose de [Primeiros Passos](/pt-BR/guide/getting-started), mais limites de recursos e tetos conservadores. Ela pressupõe um sistema operacional de 64 bits (em um Pi: Raspberry Pi OS 64-bit ou Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Observações para máquinas da classe do Pi:

- **Prefira um SSD USB a um cartão SD** para o volume de dados e o Postgres. As áreas de trabalho dos jobs fazem IO de disco de verdade, e cartões SD são lentos e se desgastam rápido.
- **O contêiner único tudo-em-um também funciona aqui** (Postgres e Redis embutidos quando `DATABASE_URL`/`REDIS_URL` não estão definidos), e em um host com pouca memória você deve reduzir o teto do Redis embutido com `REDIS_MAXMEMORY` (veja [Configuração](/pt-BR/guide/configuration)). O Compose dá um controle mais fino por serviço, e é por isso que este passo a passo o utiliza.
- **Adicione swap em dispositivos de 2 GB.** Isso evita que um pico ocasional (um PDF grande, um lote que você esqueceu de limitar) termine em um kill por falta de memória. zram é a opção amigável ao cartão SD.
- A imagem arm64 é apenas CPU; não há CUDA em placas ARM.

## Os ajustes disponíveis {#tuning-knobs}

Todos os limites são variáveis de ambiente, documentadas por completo em [Configuração](/pt-BR/guide/configuration). `0` significa ilimitado ou automático. Os que importam em hardware modesto:

| Variável | Sugestão para máquinas pequenas | O que protege |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Quantos jobs rodam em paralelo. A detecção automática usa o número de núcleos de CPU menos um, o que funciona bem em máquinas grandes e é agressivo demais em uma máquina de 2 núcleos sob pressão de memória. |
| `MAX_WORKER_THREADS` | `2` | Pool de threads de processamento de imagem. |
| `MAX_BATCH_SIZE` | `5` | É nos lotes que máquinas de 1-2 GB ficam sem memória primeiro. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Impede que um único arquivo enorme ocupe toda a área de trabalho. |
| `MAX_MEGAPIXELS` | `50` | Decodificar uma imagem de 100+ MP custa RAM independentemente do tamanho do arquivo. |
| `MAX_VIDEO_DURATION_S` | `300` | Transcodificações longas monopolizam uma CPU pequena por minutos ou horas. |
| `PROCESSING_TIMEOUT_S` | `600` | Teto rígido para que um job descontrolado acabe liberando a máquina. |

Esses limites se aplicam ao que o servidor aceita, então defina-os de acordo com o que você realmente usa, e não com o menor valor possível. Se você nunca mexe com vídeo, um limite em `MAX_VIDEO_DURATION_S` não custa nada; se você digitaliza documentos todos os dias, não limite `MAX_PDF_PAGES`.

## O que pular {#what-to-skip}

- **Bundles de IA pesados.** Upscale, restauração de fotos e remoção de fundo pedem uma GPU ou uma CPU rápida com muitos núcleos, e cada bundle custa 4-5 GB de disco. Em uma máquina pequena, simplesmente não os instale; ferramentas cujo bundle está ausente mostram um aviso de instalação em vez de rodar.
- **Recodificação de vídeo como carga de trabalho rotineira.** Transcodificações ocasionais são aceitáveis (só são lentas); uma fila constante de transcodificação pede núcleos de CPU, não um Pi.
- **Ferramentas não usadas em geral.** Um admin pode desligar ferramentas individuais em Configurações, o que as remove da interface e deixa de registrar suas rotas de API. Isso por si só não economiza memória, mas evita que uma instância pequena compartilhada seja usada justamente para a carga de trabalho que o hardware não aguenta.

Se mais tarde você mover a instância para um hardware maior, remova os limites (defina-os de volta para `0`) e o mesmo volume de dados vai junto.
