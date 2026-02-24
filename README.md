# Burnout no trabalho remoto e isolamento social

Este projeto demonstra o uso de **Web Machine Learning** aplicado à análise e recomendação de burnout em contextos de trabalho remoto. Um modelo de rede neural é treinado e executado **diretamente no navegador do usuário** com **TensorFlow.js**, enquanto o **PostgreSQL com a extensão pgvector** atua como banco de dados vetorial para persistência e recuperação de dados por similaridade. O servidor funciona apenas como provedor de dados brutos — todo o processamento de IA (normalização, treinamento, predição e classificação) acontece no client-side.

---

## Arquitetura e Funcionamento

### Treinamento do Modelo no Browser

O motor de Machine Learning reside no módulo client-side `public/js/modelTraining.js` e utiliza o **TensorFlow.js** carregado via CDN (`@tensorflow/tfjs`). A rede neural possui uma arquitetura sequencial densa com quatro camadas — entrada (128 neurônios, ReLU), duas camadas ocultas (64 e 32, ReLU) e saída (1, sigmoid) — otimizada com Adam e loss de erro quadrático médio. O treinamento é disparado pela tela de **Treinamento do Modelo**, onde o usuário define a quantidade de registros (entre 100 e 300) a serem buscados do banco de dados.

O fluxo funciona da seguinte forma:

1. O formulário envia um `POST /treinamento` ao servidor, que **apenas busca N registros brutos** do banco e retorna como JSON — nenhum treinamento ou predição acontece no servidor.
2. O browser recebe os dados brutos e executa **todo o pipeline de IA localmente** via TensorFlow.js: normalização, split 80/20 treino/validação, construção da rede neural, treinamento por 30 épocas e predição.
3. Durante o treinamento, um **Console de Treinamento em tempo real** exibe logs por época (loss, accuracy, val_loss, val_acc) com cores indicativas, e uma **barra de progresso** acompanha o avanço.
4. Os **gráficos de precisão e erro** são atualizados incrementalmente a cada 5 épocas graças aos callbacks `onEpochEnd` e `onLog`, proporcionando feedback visual contínuo.
5. Os botões ficam desabilitados durante o processamento para evitar submissões duplicadas.

Essa abordagem elimina carga computacional do servidor, permite experimentação interativa sem latência de rede e demonstra na prática o conceito de **Web Machine Learning** — onde o modelo de IA vive e opera inteiramente no navegador.

### Cadastro de Métricas Pessoais

A tela **Registrar meu dia** (Métricas Pessoais) permite que o usuário autenticado informe 11 indicadores diários divididos em dois grupos:

- **Métricas Comportamentais:** horas trabalhadas, tempo de tela, quantidade de reuniões, trocas de aplicativos, pausas realizadas e trabalho após o expediente.
- **Métricas Psicológicas:** horas de sono, índice de fadiga, índice de isolamento social e percentual de conclusão de tarefas.

Ao submeter o formulário, os dados são enviados via `POST /burnout-logs` ao servidor, que persiste o registro bruto na tabela `burnout_logs`, executa a análise de IA e armazena os resultados processados na tabela `burnout`. O retorno inclui a **pontuação de burnout** (0–100), a **classificação de risco** (Low, Medium ou High) e o **arquétipo comportamental** (Equilibrado, Sobrecarregado, Isolado ou Alta Autonomia), além de uma recomendação personalizada baseada no arquétipo identificado.

### Normalização dos Dados

Toda entrada de dados passa por uma etapa de **normalização Min-Max** implementada com operações tensoriais do TensorFlow.js. Cada uma das 11 features é mapeada para o intervalo [0, 1] com base em limites calibrados a partir do dataset de referência — por exemplo, `work_hours` varia de 0.5 a 18, `sleep_hours` de 2 a 10 e `isolation_index` de 3 a 9. A função `minMaxNormalize` cria tensores para os valores brutos, mínimos e máximos, aplica a fórmula $(x - min) / (max - min)$ e libera a memória dos tensores após a conversão. Essa normalização é essencial para que features com escalas diferentes (como horas de trabalho vs. índice de fadiga) contribuam de forma equilibrada para o cálculo da pontuação e para a comparação vetorial.

Durante o treinamento do modelo, uma segunda normalização dinâmica (`normalizeWithContext`) é aplicada, calculando min/max reais do conjunto de dados selecionado, com clamp para [0, 1] — garantindo robustez mesmo diante de valores atípicos.

### Persistência no PostgreSQL Vetorial (pgvector)

O banco de dados PostgreSQL utiliza a extensão **pgvector** para armazenar e indexar vetores numéricos. A tabela `burnout` possui uma coluna `embedding` do tipo `vector(12)` que é preenchida automaticamente por uma **trigger** (`trg_update_burnout_embedding`) a cada inserção ou atualização. O embedding é composto pelas 11 features originais do registro mais a pontuação de burnout calculada, formando um vetor de 12 dimensões que captura o perfil comportamental completo do registro.

Um **índice HNSW** (Hierarchical Navigable Small World) é criado sobre a coluna de embedding com o operador `vector_l2_ops`, permitindo buscas aproximadas de vizinhos mais próximos com alta eficiência — essencial para a recuperação por similaridade em tempo real.

### Recuperação de Dados por Similaridade para Geração do Resultado

A busca por similaridade vetorial é o mecanismo central do sistema de recomendação. No **Dashboard individual**, após o usuário acumular registros, o sistema executa uma consulta utilizando o operador de distância L2 (`<->`) do pgvector para encontrar os 5 registros mais similares ao último registro do usuário dentre **todos os outros usuários** do sistema. Essa consulta compara o embedding do registro mais recente do usuário com os embeddings de toda a base, ordenando pela menor distância euclidiana.

Os registros similares recuperados mostram ao usuário como pessoas com perfis comportamentais semelhantes foram classificadas — fornecendo um contexto comparativo que enriquece a análise individual. Essa abordagem combina a predição do modelo neural (pontuação e risco) com a recuperação baseada em conteúdo (vizinhos vetoriais), formando um sistema de recomendação híbrido.

Adicionalmente, o módulo de análise inclui um **agrupamento K-Means simplificado** com 4 centróides pré-calibrados (Equilibrado, Sobrecarregado, Isolado, Alta Autonomia) que classifica o perfil do usuário por distância euclidiana. Cada arquétipo dispara um conjunto específico de **recomendações personalizadas** com sugestões práticas de atividades, definidas no módulo `recommendations.js`.

---

## Telas do Sistema

### Login e Cadastro (`/login`, `/register`)
Telas de autenticação que permitem acesso via **e-mail/senha** ou **Google OAuth2**. O cadastro cria um novo usuário com senha hasheada (bcrypt, fator 12). As sessões são persistidas no PostgreSQL via `connect-pg-simple`. Proteção CSRF (double-submit cookie) e rate limiting (20 requisições por 15 minutos) estão aplicados em todas as rotas de autenticação.

### Página Inicial (`/`)
Landing page pública que apresenta o propósito do sistema e direciona o usuário para login, cadastro ou relatório público. Não requer autenticação.

### Registrar meu Dia — Métricas Pessoais (`/metricas_pessoais`)
Formulário protegido por autenticação onde o usuário registra as métricas do seu dia. Ao submeter, o servidor processa os dados com o pipeline de IA (normalização → predição/treinamento → classificação → arquétipo) e exibe na mesma tela o resultado completo: pontuação de burnout, nível de risco, arquétipo identificado e recomendações personalizadas de atividades. Os dados ficam persistidos para análise histórica no dashboard.

### Dashboard Individual (`/dashboard`)
Painel pessoal protegido que agrega os registros dos últimos 90 dias do usuário autenticado. Exibe:
- **Cards estatísticos** animados: total de registros, score médio, risco dominante e arquétipo principal.
- **Gráfico de distribuição de risco** (doughnut): proporção de dias Low, Medium e High.
- **Tendência temporal** (linha): médias semanais com indicação de melhora, estabilidade ou piora.
- **Anomalias detectadas**: picos de fadiga acima de 2 desvios-padrão da média.
- **Eficácia de pausas**: análise causal comparando burnout após dias com mais vs. menos pausas.
- **Tabela de registros** com filtros por data, risco e arquétipo, e paginação.
- **Registros similares** por busca vetorial: os 5 perfis mais parecidos de outros usuários.

### Treinamento do Modelo (`/treinamento`)
Tela pública que permite experimentar o modelo de IA sem necessidade de autenticação. O usuário preenche as métricas comportamentais e psicológicas, define a quantidade de registros para treinamento (100–300), e pode escolher entre dois modos: **"Treinar e Analisar"** (busca dados brutos do servidor, treina a rede neural no browser com TensorFlow.js e prediz o resultado) ou **"Analisar"** (usa apenas a regressão ponderada estática sem treinar o modelo). A tela apresenta:
- **Console de Treinamento em tempo real**: exibe logs por época com loss, accuracy e métricas de validação, com cores indicativas de progresso.
- **Barra de progresso**: acompanha o avanço do treinamento época por época.
- **Gráficos incrementais**: os charts de precisão do modelo e erro de treinamento são atualizados a cada 5 épocas durante o processo, proporcionando feedback visual contínuo.
- **Predição e recomendações**: ao final do treinamento, exibe a pontuação de burnout, classificação de risco, arquétipo identificado e recomendações personalizadas.
- **Painel de pesos**: permite ajustar os pesos da regressão estática para experimentação.

### Relatório Público (`/report`)
Visão agregada e anônima dos dados de todos os participantes, acessível sem autenticação. Apresenta:
- **Cards globais**: total de usuários, total de registros, score médio e fadiga média.
- **Distribuição de risco global** (doughnut).
- **Burnout médio por dia da semana** (barras).
- **Tendência dos últimos 30 dias** (linha).
- **Distribuição de arquétipos comportamentais** (doughnut).

Os dados são cacheados em memória por 60 segundos e as queries executam em paralelo para performance otimizada.

---

## O que Mudou — Treinamento no Browser

A arquitetura do treinamento foi migrada do servidor para o navegador, seguindo o paradigma de **Web Machine Learning**:

| Arquivo | Mudança |
|---|---|
| `public/js/modelTraining.js` **(novo)** | Engine completa de treinamento com TensorFlow.js que roda no browser. Inclui normalização Min-Max, rede neural (11→128→64→32→1), classificação de risco, K-Means para arquétipos e análise estática com pesos customizáveis. Callbacks `onLog` e `onEpochEnd` permitem saída em tempo real na tela. |
| `src/routes/treinamento.js` **(simplificado)** | O servidor agora apenas busca os N registros brutos do banco via `ORDER BY RANDOM() LIMIT $1` e retorna como JSON. Nenhum treinamento, normalização ou predição acontece no servidor. |
| `src/views/treinamento.ejs` **(atualizado)** | O formulário agora: (1) busca dados brutos do servidor, (2) treina a rede neural no browser com TensorFlow.js, (3) mostra um Console de Treinamento em tempo real com logs por época (loss, accuracy), (4) exibe uma barra de progresso durante o treinamento, (5) atualiza os gráficos incrementalmente a cada 5 épocas, (6) desabilita botões durante o processamento. |
| `src/views/layout.ejs` **(atualizado)** | Adicionados o CDN do TensorFlow.js (`@tensorflow/tfjs@4.22.0`) e o script `public/js/modelTraining.js` para disponibilizar a engine em todas as páginas. |

**Fluxo atual:** Formulário → `POST /treinamento` retorna dados brutos → TF.js no browser treina a rede neural → resultados aparecem no console e gráficos em tempo real na página.

---

## Dataset
- Fonte primária: [Kaggle: Remote Work Burnout & Social Isolation (2026)](https://www.kaggle.com/datasets/aryanmdev/remote-work-burnout-and-social-isolation-2026?resource=download) 