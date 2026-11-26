# Pastifico API

> **Autor:** Leonardo Hamilton Moreira de Camargo — projeto acadêmico da disciplina de Desenvolvimento Back-End (2026).

Sistema de autoatendimento para um restaurante italiano (Pastifico), com catálogo de produtos, carrinho de pedidos, painel de cozinha e acompanhamento de status do pedido.

## Demonstração online (GitHub Pages)

- **Cardápio:** https://leohamil31.github.io/CARDAPIO-PASTIFICO/
- **Acompanhar pedido:** https://leohamil31.github.io/CARDAPIO-PASTIFICO/order-status.html
- **Área da equipe (exige PIN):** [cozinha](https://leohamil31.github.io/CARDAPIO-PASTIFICO/kitchen.html) e [histórico](https://leohamil31.github.io/CARDAPIO-PASTIFICO/order-history.html) — não aparecem no menu do cliente.

> O repositório se chama `CARDAPIO-PASTIFICO`; o endereço antigo (`projeto-back-end-2026`) redireciona para ele.

O GitHub Pages hospeda apenas arquivos estáticos, então a versão online não executa o servidor Node.js. A pasta `public/` detecta isso sozinha (`public/api.js`) e conversa **direto com o Supabase** usando a chave publicável (`public/config.js`). A segurança fica no banco ([`supabase/public-access.sql`](./supabase/public-access.sql)):

- RLS permite apenas **leitura do cardápio**; as tabelas de pedidos não são públicas e não existe escrita direta em nenhuma tabela;
- o cliente vê só o próprio pedido (`get_order`, pelo id); cozinha e histórico usam `list_orders`, que exige o **PIN da cozinha** ([`supabase/staff-only-orders.sql`](./supabase/staff-only-orders.sql));
- pedidos são criados pela função `create_order`, que **recalcula os preços no servidor** com as mesmas regras do back-end (vinhos, refrigerantes, adicionais);
- o status do pedido só muda pela função `update_order_status`, que exige o **PIN da cozinha** (guardado com hash em um schema privado). Para trocar o PIN, rode no SQL Editor: `select private.set_kitchen_pin('NOVO-PIN');`
- o painel da cozinha e a tela "Meu pedido" atualizam em **tempo real**: um gatilho no banco envia só um aviso (id e status) pelo Supabase Realtime e as telas buscam os dados pelas funções acima;
- ao abrir o cardápio aparece uma tela de boas-vindas com o botão **Fazer pedido** e uma animação de abertura (`public/intro.js`).

Rodando localmente com `npm run dev`, o mesmo front-end usa a API REST do Express. Para forçar uma fonte, adicione `?fonte=api` ou `?fonte=supabase` à URL.

O deploy é feito pelo workflow [`.github/workflows/pages.yml`](./.github/workflows/pages.yml): a cada push na `main` ele copia a pasta `public/` para a branch `gh-pages`. Configuração única: **Settings → Pages → Source: Deploy from a branch → `gh-pages` / (root)**.

## 1. Descrição do projeto

A Pastifico API resolve o problema de pedidos presenciais em um restaurante de massas italianas: o cliente monta o próprio pedido pelo totem/app, a cozinha acompanha os pedidos recebidos em um painel próprio e o cliente consegue acompanhar o status (`Recebido` → `Preparando` → `Pronto` → `Entregue`) em tempo real.

- **Domínio escolhido:** restaurante (autoatendimento).
- **Objetivo da API:** expor endpoints REST para gerenciar o catálogo (categorias e produtos) e o ciclo de vida dos pedidos (criação, consulta, atualização de status e remoção), persistindo os dados no Supabase/PostgreSQL.

## 2. Integrantes da equipe

- **Leonardo Hamilton Moreira de Camargo** (autor)
- Gabriel Henrique Brito Nery
- Ana Gabriela Rodrigues Harps

## 3. Tecnologias utilizadas

- Node.js
- TypeScript
- Express 5
- Supabase (`@supabase/supabase-js`)
- PostgreSQL (via Supabase)
- dotenv (variáveis de ambiente)
- tsx (execução/watch em desenvolvimento)
- Vitest (testes unitários e de integração) + `@vitest/coverage-v8` (relatório de cobertura)
- Supertest (requisições HTTP nos testes de integração)
- OpenAPI 3 + Swagger UI (documentação interativa em `/api-docs`)
- Git / GitHub (versionamento)

## 4. Entidades e relacionamento

O projeto possui 4 entidades, formando dois pares relacionados por chave estrangeira (categoria/produto e pedido/itens do pedido):

### Category (categoria)

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | Identificador único |
| name | string | Nome da categoria |
| description | string | Descrição da categoria |
| createdAt | datetime | Data de criação |

### Product (produto)

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | Identificador único |
| name | string | Nome do produto |
| description | string | Descrição do produto |
| price | number | Preço unitário |
| image | string | URL da imagem do produto |
| isAvailable | boolean | Se o produto está disponível para venda |
| categoryId | uuid (FK) | Referência à categoria do produto |
| createdAt | datetime | Data de criação |

### Order (pedido)

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | Identificador único |
| customerName | string | Nome do cliente |
| tableNumber | number | Número da mesa |
| status | string | `Recebido`, `Preparando`, `Pronto` ou `Entregue` |
| items | OrderItem[] | Itens do pedido |
| total | number | Valor total do pedido |
| paymentMethod | string | `PIX`, `Cartão` ou `Dinheiro` |
| paymentStatus | string | `Aguardando no caixa` ou `Pago` |
| createdAt | datetime | Data de criação |

### OrderItem (item do pedido)

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | Identificador único |
| orderId | uuid (FK) | Referência ao pedido |
| productId | uuid (FK) | Referência ao produto |
| name | string | Nome do produto no momento da compra |
| quantity | number | Quantidade |
| unitPrice | number | Preço unitário cobrado |
| subtotal | number | `quantity * unitPrice` |
| options | string[] | Adicionais escolhidos (ex.: "Bacon crocante") |

**Relacionamentos:**

- Uma **Categoria** pode possuir vários **Produtos**; cada **Produto** pertence a uma única **Categoria** (`products.category_id → categories.id`).
- Um **Pedido** pode possuir vários **Itens de pedido**; cada **Item** pertence a um único **Pedido** (`order_items.order_id → orders.id`) e referencia o **Produto** vendido (`order_items.product_id → products.id`).

## 5. Regras de negócio

As regras ficam na camada **Services** (`src/services/`), separadas do acesso a dados (Repositories) e da camada HTTP (Controllers). Quando uma regra não é atendida, o Service lança um erro com o código HTTP adequado (`ValidationError` 400, `NotFoundError` 404, `ConflictError` 409).

**Categorias (`CategoryService`)**
- Nome e descrição são obrigatórios; o nome é **único** (sem diferenciar maiúsculas/minúsculas) → `409`.
- Uma atualização precisa alterar ao menos um campo → `400`.
- **Não é possível remover uma categoria que ainda tem produtos** vinculados → `409`.

**Produtos (`ProductService`)**
- O **preço não pode ser negativo** → `400`.
- O produto precisa pertencer a uma **categoria existente** → `400`.
- O nome do produto é **único** no cardápio → `409`.
- **Produto que já aparece em pedidos não pode ser removido** (deve ser marcado como `isAvailable: false`) → `409`.

**Pedidos (`OrderService` + `PricingService`)**
- O pedido precisa ter **de 1 a 50 itens**, cada um com **quantidade inteira de 1 a 99** → `400`.
- Só entram produtos **existentes e disponíveis** (`isAvailable = true`) → `400`.
- **Preços calculados no servidor:** o valor enviado pelo cliente é ignorado. Taça de vinho custa R$ 18,00; refrigerante em lata R$ 7,50 (gelo +R$ 1,50, limão/laranja +R$ 1,00); adicionais de pratos e sobremesas têm preço fixo. Adicional incompatível com o produto (ex.: "Bacon crocante" em um vinho) → `400`.
- Formas de pagamento aceitas: `PIX`, `Cartão` ou `Dinheiro` (padrão). O pagamento é feito no caixa, então todo pedido nasce com `paymentStatus = "Aguardando no caixa"`.
- Todo pedido nasce com status **Recebido**; os status válidos são `Recebido`, `Preparando`, `Pronto` e `Entregue` → `400` para outros.
- **Um pedido só pode ser editado (`PUT /orders/:id`) enquanto está "Recebido"**, antes de a cozinha começar o preparo → `409`. Se os itens forem trocados, o total é recalculado.
- O painel da cozinha mostra apenas pedidos **ainda não entregues**.

**Segurança**
- Com `KITCHEN_PIN` definido, as rotas da equipe exigem o cabeçalho `x-kitchen-pin` → `401`.

## 6. Estrutura do projeto

```
src/
├── config/        # Conexão com Supabase e persistência local (fallback em JSON)
├── controllers/   # Classes que recebem a requisição HTTP, validam o formato da entrada e chamam os Services
├── docs/          # Especificação OpenAPI (Swagger) da API
├── errors/        # Classes de erro (HttpError, ValidationError, NotFoundError, ConflictError)
├── middlewares/   # asyncHandler, errorHandler central e autenticação por PIN da equipe
├── models/        # Tipos das entidades (Category, Product, Order, OrderItem)
├── repositories/  # Classes de acesso a dados (Supabase ou JSON local), uma por entidade, com interfaces
├── routes/        # Rotas Express de cada recurso
├── services/      # Classes com as regras de negócio (Category, Product, Order e Pricing)
├── utils/         # Validação de entrada, UUID e utilitários
├── container.ts   # Cria e conecta as classes (injeção de dependências)
├── app.ts         # Configuração do Express (middlewares, rotas, tratamento de erros)
└── server.ts      # Ponto de entrada; inicia o servidor HTTP

tests/
├── unit/          # Testes unitários com mocks (Services e Repositories no modo Supabase)
├── integration/   # Testes de integração dos endpoints com Supertest
├── helpers.ts     # Funções de apoio (criar categoria/produto, cliente HTTP)
└── setup.ts       # Banco temporário por arquivo de teste e limpeza ao final
scripts/     # Migração do JSON local para o Supabase e abertura das telas no navegador
supabase/    # Scripts SQL: schema, acesso público (GitHub Pages), pedidos da equipe e reset
public/      # Front-end (cardápio, meu pedido, cozinha, histórico), também publicado no GitHub Pages
postman/     # Coleção e ambiente do Postman
data/        # Banco local em JSON (usado quando o Supabase não está configurado)
.github/     # CI (testes a cada push) e deploy do GitHub Pages
```

**Fluxo de uma requisição (camadas):**

```
Route → Controller → Service (regras de negócio) → Repository (Supabase/PostgreSQL)
         (HTTP)       (CategoryService, ...)        (CategoryRepository, ...)
```

**Orientação a Objetos:** Controllers, Services e Repositories são **classes**. Os Services recebem os Repositories pelo construtor (`private readonly`, encapsulamento) e dependem apenas das **interfaces** (`ICategoryRepository`, `IProductRepository`, `IOrderRepository`), o que permite trocar o banco ou usar mocks nos testes unitários. Os erros usam **herança** (`NotFoundError extends HttpError extends Error`). As instâncias são criadas em `src/container.ts`.

## 7. Configuração e execução

### Pré-requisitos

- Node.js 20 ou mais recente
- Uma conta/projeto no [Supabase](https://supabase.com) (opcional — sem ele, o projeto roda com um arquivo JSON local)

### Passo a passo

1. Clone o repositório:

   ```powershell
   git clone https://github.com/leohamil31/CARDAPIO-PASTIFICO.git
   cd cardapio-pastifico
   ```

2. Instale as dependências:

   ```powershell
   npm install
   ```

3. Configure as variáveis de ambiente (veja a seção [8](#8-variáveis-de-ambiente)):

   ```powershell
   Copy-Item .env.example .env
   ```

4. Inicie a aplicação em modo desenvolvimento:

   ```powershell
   npm run dev
   ```

5. Acesse no navegador:
   - Cliente: `http://localhost:3000/`
   - Painel da cozinha: `http://localhost:3000/kitchen-dashboard`
   - Histórico: `http://localhost:3000/order-history`
   - Status do pedido: `http://localhost:3000/order-status`
   - Health check: `http://localhost:3000/api/health`
   - Documentação Swagger: `http://localhost:3000/api-docs`

### Outros comandos

```powershell
npm run build    # Compila o TypeScript para dist/
npm start        # Executa a versão compilada (dist/server.js)
npm test                  # Executa todos os testes (unitários + integração) com Vitest
npm run test:unit         # Apenas os testes unitários
npm run test:integration  # Apenas os testes de integração
npm run test:coverage     # Todos os testes + relatório de cobertura (mínimo de 60% em cada métrica)
npm run typecheck         # Verifica os tipos do código e dos testes sem gerar build
```

## 8. Variáveis de ambiente

O arquivo `.env.example` documenta as variáveis necessárias (sem valores reais):

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
KITCHEN_PIN=
```

- Se **ambas** estiverem vazias, a API usa automaticamente o arquivo local `data/pastifico-db.json` para persistir os dados.
- Se **ambas** estiverem preenchidas com as credenciais do seu projeto Supabase, a API passa a usar o Supabase/PostgreSQL. O health check consulta `categories` e retorna `database: "connected"`; falhas de conexão ou de schema retornam HTTP 503 e `database: "unavailable"`.
- Se apenas uma das duas variáveis estiver preenchida, a API retorna erro de configuração em vez de trocar silenciosamente para o banco local.

- `KITCHEN_PIN` (opcional): quando definida, as rotas da equipe passam a exigir o cabeçalho `x-kitchen-pin` com esse valor — listagem de pedidos (`GET /orders`, `/orders/kitchen`, `/orders/table/:n`, `/kitchen`), mudança de status, exclusão de pedidos e o cadastro de categorias/produtos (`POST`/`PUT`/`DELETE`). Cardápio, criação de pedido e consulta de um pedido pelo id continuam públicos. Deixe vazia no desenvolvimento local e nos testes.

**Importante:** o arquivo `.env` com as credenciais reais nunca é enviado ao Git (está listado no `.gitignore`). Apenas o `.env.example`, com os nomes das variáveis vazios, é versionado.

### Deploy na Vercel

O projeto já está pronto para a Vercel ([`vercel.json`](./vercel.json)). A Vercel detecta o Express sozinha pelo `src/app.ts` (que exporta o `app`) e serve a pasta `public/` pela CDN.

1. Acesse [vercel.com/new](https://vercel.com/new), entre com o GitHub e importe o repositório `CARDAPIO-PASTIFICO`. Não é preciso mudar o comando de build nem a pasta de saída.
2. Em **Settings → Environment Variables**, cadastre `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `KITCHEN_PIN` (use o mesmo PIN da cozinha). Sem o Supabase, a API usa um JSON temporário que é apagado a cada reinício — serve só para demonstração.
3. Clique em **Deploy**. A cada push na `main` a Vercel publica uma nova versão; cada pull request ganha uma URL de pré-visualização.

No domínio `*.vercel.app`, as telas falam direto com o Supabase (com o PIN da cozinha), igual ao GitHub Pages; a API Express fica disponível no mesmo endereço para o Postman e a documentação (`/api-docs`).

## 9. Banco de dados

O banco utiliza 4 tabelas no PostgreSQL (Supabase), criadas pelo script [`supabase/schema.sql`](./supabase/schema.sql):

- `categories` (`id uuid`, `name`, `description`, `created_at`)
- `products` (`id uuid`, `name`, `description`, `price`, `image`, `is_available`, `category_id uuid → categories.id`, `created_at`)
- `orders` (`id uuid`, `customer_name`, `table_number`, `status`, `total`, `payment_method`, `payment_status`, `created_at`)
- `order_items` (`id uuid`, `order_id uuid → orders.id`, `product_id uuid → products.id`, `name`, `quantity`, `unit_price`, `subtotal`, `options`)

Todas as chaves primárias usam `uuid` (gerado com `gen_random_uuid()`), e as relações entre `products → categories`, `order_items → orders` e `order_items → products` são implementadas com chaves estrangeiras (Foreign Key).

Para reproduzir a estrutura em um projeto Supabase novo:

1. Abra o **SQL Editor** do seu projeto Supabase.
2. No SQL Editor, execute nesta ordem: [`supabase/schema.sql`](./supabase/schema.sql), [`supabase/public-access.sql`](./supabase/public-access.sql) e [`supabase/staff-only-orders.sql`](./supabase/staff-only-orders.sql). Os dois últimos são necessários para a versão do GitHub Pages; depois defina o PIN da cozinha com `select private.set_kitchen_pin('SEU-PIN');`.
3. (Opcional) Para carregar o catálogo inicial de exemplo (4 categorias e 27 produtos) a partir do `data/pastifico-db.json`, rode:

   ```powershell
   npm run migrate:supabase
   ```

   O script é idempotente: sincroniza categorias e produtos pelo **nome** (traduzindo os ids locais para os ids do Supabase), então pode ser executado mais de uma vez sem erro de duplicidade.

Caso precise recomeçar do zero em um projeto Supabase já existente, use [`supabase/reset-schema.sql`](./supabase/reset-schema.sql) antes do `schema.sql` (⚠️ isso apaga todos os dados atuais das tabelas).

## 10. Documentação dos endpoints

### Categorias

| Método | Endpoint | Descrição | Corpo da requisição |
|---|---|---|---|
| GET | `/categories` | Lista todas as categorias | — |
| GET | `/categories/:id` | Consulta uma categoria pelo id | — |
| POST | `/categories` | Cadastra uma nova categoria | `{ "name": string, "description": string }` |
| PUT | `/categories/:id` | Atualiza uma categoria | `{ "name"?: string, "description"?: string }` |
| DELETE | `/categories/:id` | Remove uma categoria | — |

### Produtos

| Método | Endpoint | Descrição | Corpo da requisição |
|---|---|---|---|
| GET | `/products` | Lista todos os produtos | — |
| GET | `/products/:id` | Consulta um produto pelo id | — |
| POST | `/products` | Cadastra um novo produto | `{ "name": string, "description": string, "price": number, "image": string, "isAvailable": boolean, "categoryId": string }` |
| PUT | `/products/:id` | Atualiza um produto | Qualquer subconjunto dos campos acima |
| DELETE | `/products/:id` | Remove um produto | — |

### Pedidos

| Método | Endpoint | Descrição | Corpo da requisição |
|---|---|---|---|
| GET | `/orders` | Lista todos os pedidos | — |
| GET | `/orders/:id` | Consulta um pedido pelo id | — |
| POST | `/orders` | Cria um novo pedido | `{ "customerName": string, "tableNumber": number, "items": [{ "productId": string, "quantity": number, "options"?: string[] }], "paymentMethod"?: "PIX" \| "Cartão" \| "Dinheiro" }` |
| PUT | `/orders/:id` | Atualiza um pedido (só com status `Recebido`) | `{ "customerName"?: string, "tableNumber"?: number, "paymentMethod"?: string, "items"?: [...] }` |
| PATCH | `/orders/:id/status` | Atualiza o status do pedido | `{ "status": "Recebido" \| "Preparando" \| "Pronto" \| "Entregue" }` |
| DELETE | `/orders/:id` | Remove um pedido | — |
| GET | `/orders/kitchen` | Lista pedidos pendentes para a cozinha (status diferente de `Entregue`) | — |
| GET | `/orders/table/:tableNumber` | Lista os pedidos de uma mesa | — |

### Sistema

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/health` | Retorna status da API e o tipo de persistência ativa (`supabase` ou `local-json`) |
| GET | `/api-docs` | Documentação interativa (Swagger UI) |
| GET | `/api-docs/openapi.json` | Especificação OpenAPI 3 (pode ser importada no Postman) |

### Códigos de resposta e erros

Todos os erros retornam JSON no formato `{ "message": "..." }`.

| Código | Quando acontece |
|---|---|
| 200 / 201 / 204 | Sucesso (consulta/atualização, criação, remoção) |
| 400 | JSON malformado, campo obrigatório ausente, tipo inválido, `:id` que não é UUID, adicional incompatível com o produto |
| 404 | Registro não encontrado ou rota inexistente |
| 401 | Rota da equipe sem o cabeçalho `x-kitchen-pin` correto (quando `KITCHEN_PIN` está definido) |
| 409 | Nome de categoria/produto duplicado; remoção de categoria com produtos; remoção de produto que já aparece em pedidos; edição de pedido que já saiu do status `Recebido` |
| 413 | Corpo da requisição maior que 100 KB |
| 500 | Erro inesperado (detalhes só no log do servidor) |

## 11. Exemplos de requisições

**Criar categoria** — `POST /categories`

```json
{
  "name": "Sobremesas",
  "description": "Doçura final com sabores italianos clássicos"
}
```

**Criar produto** — `POST /products`

```json
{
  "name": "Tiramisu",
  "description": "Clássico italiano com café, mascarpone e cacau.",
  "price": 21.9,
  "image": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9",
  "isAvailable": true,
  "categoryId": "5502efc9-d2bf-44a8-b8a1-fafc81dbbea6"
}
```

**Atualizar produto (preço e disponibilidade)** — `PUT /products/:id`

```json
{
  "price": 24.9,
  "isAvailable": false
}
```

**Criar pedido** — `POST /orders`

```json
{
  "customerName": "Maria",
  "tableNumber": 5,
  "paymentMethod": "PIX",
  "items": [
    {
      "productId": "4ace3d9a-90f9-44fc-956f-b7a83bdda1ad",
      "quantity": 2,
      "options": ["Bacon crocante"]
    }
  ]
}
```

**Atualizar pedido (mesa, pagamento e itens)** — `PUT /orders/:id`

```json
{
  "tableNumber": 7,
  "paymentMethod": "Cartão",
  "items": [
    { "productId": "a7a88ed2-1200-4ef0-948d-e0a5c60a3b97", "quantity": 2, "options": ["Chantilly"] }
  ]
}
```

**Atualizar categoria** — `PUT /categories/:id`

```json
{
  "description": "Massas frescas feitas na casa"
}
```

**Atualizar status do pedido** — `PATCH /orders/:id/status`

```json
{
  "status": "Preparando"
}
```

## 12. Testes automatizados e cobertura

**Ferramentas:** [Vitest](https://vitest.dev) (executor e asserções), Supertest (requisições HTTP) e `@vitest/coverage-v8` (cobertura). A configuração está em [`vitest.config.mts`](./vitest.config.mts).

**Organização:**

| Pasta | Tipo | O que testa |
|---|---|---|
| `tests/unit/services/` | Unitário | Regras de negócio de `CategoryService`, `ProductService`, `OrderService` e `PricingService`. Os Repositories são substituídos por **mocks** (`vi.fn()`), então nenhum banco é usado. |
| `tests/unit/repositories/` | Unitário | Repositories no modo Supabase com o **cliente Supabase mockado** (`vi.mock`): conversão de colunas, filtros enviados e tratamento de erros do banco. |
| `tests/integration/` | Integração | Todos os endpoints com Supertest: criação, listagem, consulta por id, atualização e exclusão das 3 entidades (categorias, produtos e pedidos), códigos HTTP (200, 201, 204, 400, 401, 404, 409) e dados retornados; também Swagger, PIN da equipe e middleware de erros. |

**Como executar:**

```powershell
npm test                  # todos os testes
npm run test:unit         # só os unitários
npm run test:integration  # só os de integração
npm run test:coverage     # todos + relatório de cobertura
```

O relatório de cobertura aparece no terminal e também em HTML em `coverage/index.html`. O comando falha se **linhas, instruções (statements), funções ou ramificações (branches)** ficarem abaixo de **60%**. Apenas `src/server.ts` (que só abre a porta HTTP) fica fora da medição. No GitHub, o workflow de CI roda os testes a cada push e publica o relatório como artefato `coverage-report`.

**Cobertura alcançada:**

**175 testes** (92 unitários + 83 de integração), todos passando. Resultado de `npm run test:coverage` no CI:

| Métrica | Cobertura | Mínimo exigido |
|---|---|---|
| Linhas (lines) | **97,95%** | 60% |
| Instruções (statements) | **97,95%** | 60% |
| Funções (functions) | **99,13%** | 60% |
| Ramificações (branches) | **94,89%** | 60% |

Por camada: `services` 100%, `controllers` 100%, `repositories` 100% das linhas (96,65% dos branches), `routes` 100%, `middlewares` 100%. A pasta `models` aparece com 0% porque contém apenas tipos TypeScript (`interface`), que não geram código executável.

**Cuidados com o banco de dados nos testes:**
- Os testes **nunca acessam o Supabase real**, mesmo com o `.env` preenchido: o `tests/setup.ts` desliga as variáveis do Supabase antes de cada arquivo de teste.
- Os testes de integração usam um banco JSON **temporário e exclusivo** por arquivo de teste (variável `PASTIFICO_DB_PATH`), criado a partir do cardápio de exemplo e **apagado ao final** — assim os testes podem ser executados novamente, em paralelo, sem interferir uns nos outros nem alterar `data/pastifico-db.json`.
- Os dados criados usam nomes únicos (sufixo aleatório) para que um cenário não interfira em outro.

## 13. Documentação Swagger/OpenAPI

Com a aplicação rodando (`npm run dev`), acesse **http://localhost:3000/api-docs**. A página do Swagger UI lista todas as rotas agrupadas por recurso (Sistema, Categorias, Produtos, Pedidos e Cozinha), com parâmetros, corpo esperado (com exemplos), respostas e códigos HTTP. Para testar um endpoint, clique nele → **Try it out** → preencha os campos → **Execute**.

A especificação em JSON fica em `http://localhost:3000/api-docs/openapi.json` e é definida em [`src/docs/openapi.ts`](./src/docs/openapi.ts). Ela também pode ser importada no Postman.

## Testar no Postman

1. Inicie o servidor com `npm run dev`.
2. Importe estes arquivos no Postman (**Import → Files**):
   - `postman/Pastifico API.postman_collection.json`
   - `postman/Pastifico Local.postman_environment.json`
3. Selecione o ambiente **Pastifico Local**.
4. Teste primeiro `Sistema → Health check`; a resposta esperada é `200 OK`.
5. Rode `Categorias → Listar categorias` e `Produtos → Listar produtos` para capturar automaticamente os ids (uuid) reais nas variáveis `categoryId` e `productId` da coleção.
6. A partir daí, as demais requisições já funcionam usando os ids capturados automaticamente.
7. Para validar tudo de uma vez, use **Run collection** (Collection Runner): as requisições têm testes `pm.test` e devem passar na ordem das pastas.
8. A pasta **DELETE Produtos** apaga um produto real pelo id: preencha a variável `deleteProductId` da coleção antes de usar (sem ela, as requisições são puladas).

A coleção nunca altera ou remove itens reais do cardápio: o que ela cria fica em `createdCategoryId`/`createdProductId` (com nome único via `{{$timestamp}}`) e é removido ao final. Os ids ficam só nas variáveis da coleção — o ambiente **Pastifico Local** contém apenas `baseUrl` e `tableNumber`, porque variáveis de ambiente têm prioridade sobre as da coleção no Postman.

## Observação sobre pagamentos

PIX, cartão e dinheiro são apenas selecionados no pedido e concluídos presencialmente no caixa. O projeto não processa pagamentos online.
