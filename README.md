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
- Supertest + Node Test Runner (`node:test`) para testes automatizados, com cobertura nativa do Node.js
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

## 5. Estrutura do projeto

```
src/
├── config/          # Conexão com Supabase e persistência local (fallback em JSON)
├── controllers/     # Recebem a requisição HTTP, validam entrada e chamam os repositories
├── docs/            # Especificação OpenAPI (Swagger) da API
├── middlewares/      # asyncHandler (captura de erros assíncronos) e errorHandler central
├── models/            # Interfaces/tipos das entidades (Category, Product, Order)
├── repositories/       # Acesso a dados (Supabase ou JSON local) para cada entidade
├── routes/              # Definição das rotas Express de cada recurso
├── utils/                 # Validação de entrada, UUID e utilitários
├── app.ts                  # Configuração do Express (middlewares, rotas, tratamento de erro)
└── server.ts                 # Ponto de entrada; inicia o servidor HTTP

tests/        # Testes automatizados por recurso (categorias, produtos, pedidos, sistema)
scripts/      # Script de migração do JSON local para o Supabase
supabase/     # Scripts SQL (schema e reset) para criar/recriar as tabelas
public/       # Front-end estático (cardápio, cozinha, status, histórico) — também publicado no GitHub Pages
data/         # Banco de dados local em JSON (fallback quando o Supabase não está configurado)
```

## 6. Configuração e execução

### Pré-requisitos

- Node.js 22.8 ou mais recente (necessário para o relatório de cobertura nativo)
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

3. Configure as variáveis de ambiente (veja a seção [7](#7-variáveis-de-ambiente)):

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
npm test         # Executa os testes automatizados (usa sempre um banco local temporário)
npm run test:coverage  # Testes + relatório de cobertura (falha se a cobertura de linhas ficar abaixo de 60%)
npm run typecheck      # Verifica os tipos do código e dos testes sem gerar build
```

## 7. Variáveis de ambiente

O arquivo `.env.example` documenta as variáveis necessárias (sem valores reais):

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

- Se **ambas** estiverem vazias, a API usa automaticamente o arquivo local `data/pastifico-db.json` para persistir os dados.
- Se **ambas** estiverem preenchidas com as credenciais do seu projeto Supabase, a API passa a usar o Supabase/PostgreSQL. O health check consulta `categories` e retorna `database: "connected"`; falhas de conexão ou de schema retornam HTTP 503 e `database: "unavailable"`.
- Se apenas uma das duas variáveis estiver preenchida, a API retorna erro de configuração em vez de trocar silenciosamente para o banco local.

**Importante:** o arquivo `.env` com as credenciais reais nunca é enviado ao Git (está listado no `.gitignore`). Apenas o `.env.example`, com os nomes das variáveis vazios, é versionado.

## 8. Banco de dados

O banco utiliza 4 tabelas no PostgreSQL (Supabase), criadas pelo script [`supabase/schema.sql`](./supabase/schema.sql):

- `categories` (`id uuid`, `name`, `description`, `created_at`)
- `products` (`id uuid`, `name`, `description`, `price`, `image`, `is_available`, `category_id uuid → categories.id`, `created_at`)
- `orders` (`id uuid`, `customer_name`, `table_number`, `status`, `total`, `payment_method`, `payment_status`, `created_at`)
- `order_items` (`id uuid`, `order_id uuid → orders.id`, `product_id uuid → products.id`, `name`, `quantity`, `unit_price`, `subtotal`, `options`)

Todas as chaves primárias usam `uuid` (gerado com `gen_random_uuid()`), e as relações entre `products → categories`, `order_items → orders` e `order_items → products` são implementadas com chaves estrangeiras (Foreign Key).

Para reproduzir a estrutura em um projeto Supabase novo:

1. Abra o **SQL Editor** do seu projeto Supabase.
2. Execute o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql) e depois [`supabase/public-access.sql`](./supabase/public-access.sql) (necessário para a versão do GitHub Pages).
3. (Opcional) Para carregar o catálogo inicial de exemplo (4 categorias e 27 produtos) a partir do `data/pastifico-db.json`, rode:

   ```powershell
   npm run migrate:supabase
   ```

   O script é idempotente: sincroniza categorias e produtos pelo **nome** (traduzindo os ids locais para os ids do Supabase), então pode ser executado mais de uma vez sem erro de duplicidade.

Caso precise recomeçar do zero em um projeto Supabase já existente, use [`supabase/reset-schema.sql`](./supabase/reset-schema.sql) antes do `schema.sql` (⚠️ isso apaga todos os dados atuais das tabelas).

## 9. Documentação dos endpoints

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
| 409 | Nome de categoria/produto duplicado; remoção de categoria com produtos; remoção de produto que já aparece em pedidos |
| 413 | Corpo da requisição maior que 100 KB |
| 500 | Erro inesperado (detalhes só no log do servidor) |

## 10. Exemplos de requisições

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

**Atualizar status do pedido** — `PATCH /orders/:id/status`

```json
{
  "status": "Preparando"
}
```

## Testes

```powershell
npm test
npm run test:coverage
```

- 75 testes em `tests/` cobrindo todas as rotas de Categorias, Produtos e Pedidos (casos de sucesso, 400, 404 e 409), regras de preço dos adicionais, painel da cozinha, documentação e o middleware de erros.
- Cada arquivo de teste usa um banco JSON temporário próprio (variável `PASTIFICO_DB_PATH`), então `data/pastifico-db.json` não é alterado e o Supabase nunca é acessado, mesmo com o `.env` preenchido.
- `npm run test:coverage` usa a cobertura nativa do Node.js (`--experimental-test-coverage`) apenas sobre `src/` e encerra com erro se a cobertura de linhas ficar abaixo de **60%**. Cobertura atual: ~89% das linhas (os trechos não cobertos são os ramos específicos do Supabase).

## Testar no Postman

1. Inicie o servidor com `npm run dev`.
2. Importe estes arquivos no Postman (**Import → Files**):
   - `postman/Pastifico API.postman_collection.json`
   - `postman/Pastifico Local.postman_environment.json`
3. Selecione o ambiente **Pastifico Local**.
4. Teste primeiro `Sistema → Health check`; a resposta esperada é `200 OK`.
5. Rode `Categorias → Listar categorias` e `Produtos → Listar produtos` para capturar automaticamente os ids (uuid) reais nas variáveis `categoryId` e `productId` da coleção.
6. A partir daí, as demais requisições já funcionam usando os ids capturados automaticamente.
7. Para validar tudo de uma vez, use **Run collection** (Collection Runner): as 28 requisições têm testes `pm.test` e devem passar na ordem das pastas.

A coleção nunca altera ou remove itens reais do cardápio: o que ela cria fica em `createdCategoryId`/`createdProductId` (com nome único via `{{$timestamp}}`) e é removido ao final. Os ids ficam só nas variáveis da coleção — o ambiente **Pastifico Local** contém apenas `baseUrl` e `tableNumber`, porque variáveis de ambiente têm prioridade sobre as da coleção no Postman.

## Observação sobre pagamentos

PIX, cartão e dinheiro são apenas selecionados no pedido e concluídos presencialmente no caixa. O projeto não processa pagamentos online.
