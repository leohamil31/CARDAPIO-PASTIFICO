/**
 * Especificação OpenAPI 3.0 da Pastifico API.
 * Servida em JSON em GET /api-docs/openapi.json e exibida de forma interativa
 * (Swagger UI) em GET /api-docs. Também pode ser importada no Postman.
 */

const uuid = { type: 'string', format: 'uuid', example: '5502efc9-d2bf-44a8-b8a1-fafc81dbbea6' };
const idParam = { name: 'id', in: 'path', required: true, description: 'Identificador (UUID)', schema: uuid };

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
});

const json = (schema: object) => ({ 'application/json': { schema } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const list = (name: string) => ({ type: 'array', items: ref(name) });

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Pastifico API',
    version: '1.0.0',
    description:
      'API REST de autoatendimento para restaurante de massas italianas (catálogo, pedidos e painel da cozinha).\n\n' +
      'Autor: Leonardo Hamilton Moreira de Camargo. Equipe: Gabriel Henrique Brito Nery e Ana Gabriela Rodrigues Harps.',
    contact: { name: 'Leonardo Hamilton Moreira de Camargo', url: 'https://github.com/leohamil31/projeto-back-end-2026' },
    license: { name: 'MIT' }
  },
  servers: [{ url: 'http://localhost:3000', description: 'Ambiente local' }],
  tags: [
    { name: 'Sistema' },
    { name: 'Categorias' },
    { name: 'Produtos' },
    { name: 'Pedidos' },
    { name: 'Cozinha' }
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Sistema'],
        summary: 'Status da API e tipo de persistência ativa',
        responses: { 200: { description: 'API no ar' } }
      }
    },
    '/categories': {
      get: {
        tags: ['Categorias'],
        summary: 'Lista todas as categorias',
        responses: { 200: { description: 'Lista de categorias', content: json(list('Category')) } }
      },
      post: {
        tags: ['Categorias'],
        summary: 'Cadastra uma categoria',
        requestBody: { required: true, content: json(ref('CategoryInput')) },
        responses: {
          201: { description: 'Categoria criada', content: json(ref('Category')) },
          400: error('Dados inválidos ou JSON malformado'),
          409: error('Já existe uma categoria com esse nome')
        }
      }
    },
    '/categories/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Categorias'],
        summary: 'Consulta uma categoria',
        responses: {
          200: { description: 'Categoria encontrada', content: json(ref('Category')) },
          400: error('id não é um UUID válido'),
          404: error('Categoria não encontrada')
        }
      },
      put: {
        tags: ['Categorias'],
        summary: 'Atualiza uma categoria (parcial)',
        requestBody: { required: true, content: json(ref('CategoryUpdate')) },
        responses: {
          200: { description: 'Categoria atualizada', content: json(ref('Category')) },
          400: error('Dados inválidos'),
          404: error('Categoria não encontrada'),
          409: error('Nome duplicado')
        }
      },
      delete: {
        tags: ['Categorias'],
        summary: 'Remove uma categoria',
        responses: {
          204: { description: 'Removida' },
          400: error('id não é um UUID válido'),
          404: error('Categoria não encontrada'),
          409: error('Existem produtos vinculados à categoria')
        }
      }
    },
    '/products': {
      get: {
        tags: ['Produtos'],
        summary: 'Lista todos os produtos',
        responses: { 200: { description: 'Lista de produtos', content: json(list('Product')) } }
      },
      post: {
        tags: ['Produtos'],
        summary: 'Cadastra um produto',
        requestBody: { required: true, content: json(ref('ProductInput')) },
        responses: {
          201: { description: 'Produto criado', content: json(ref('Product')) },
          400: error('Dados inválidos ou categoria inexistente'),
          409: error('Já existe um produto com esse nome')
        }
      }
    },
    '/products/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Produtos'],
        summary: 'Consulta um produto',
        responses: {
          200: { description: 'Produto encontrado', content: json(ref('Product')) },
          400: error('id não é um UUID válido'),
          404: error('Produto não encontrado')
        }
      },
      put: {
        tags: ['Produtos'],
        summary: 'Atualiza um produto (parcial)',
        requestBody: { required: true, content: json(ref('ProductUpdate')) },
        responses: {
          200: { description: 'Produto atualizado', content: json(ref('Product')) },
          400: error('Dados inválidos'),
          404: error('Produto não encontrado'),
          409: error('Nome duplicado')
        }
      },
      delete: {
        tags: ['Produtos'],
        summary: 'Remove um produto',
        responses: {
          204: { description: 'Removido' },
          400: error('id não é um UUID válido'),
          404: error('Produto não encontrado'),
          409: error('Produto já aparece em pedidos')
        }
      }
    },
    '/orders': {
      get: {
        tags: ['Pedidos'],
        summary: 'Lista todos os pedidos',
        responses: { 200: { description: 'Lista de pedidos', content: json(list('Order')) } }
      },
      post: {
        tags: ['Pedidos'],
        summary: 'Cria um pedido (preços calculados no servidor)',
        requestBody: { required: true, content: json(ref('OrderInput')) },
        responses: {
          201: { description: 'Pedido criado com status Recebido', content: json(ref('Order')) },
          400: error('Dados inválidos, produto indisponível ou adicional inválido')
        }
      }
    },
    '/orders/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Pedidos'],
        summary: 'Consulta um pedido',
        responses: {
          200: { description: 'Pedido encontrado', content: json(ref('Order')) },
          400: error('id não é um UUID válido'),
          404: error('Pedido não encontrado')
        }
      },
      delete: {
        tags: ['Pedidos'],
        summary: 'Remove um pedido (e seus itens)',
        responses: {
          204: { description: 'Removido' },
          400: error('id não é um UUID válido'),
          404: error('Pedido não encontrado')
        }
      }
    },
    '/orders/{id}/status': {
      parameters: [idParam],
      patch: {
        tags: ['Pedidos'],
        summary: 'Atualiza o status do pedido',
        requestBody: {
          required: true,
          content: json({ type: 'object', required: ['status'], properties: { status: ref('OrderStatus') } })
        },
        responses: {
          200: { description: 'Status atualizado', content: json(ref('Order')) },
          400: error('Status inválido'),
          404: error('Pedido não encontrado')
        }
      }
    },
    '/orders/kitchen': {
      get: {
        tags: ['Cozinha'],
        summary: 'Pedidos em aberto (status diferente de Entregue)',
        responses: { 200: { description: 'Lista de pedidos', content: json(list('Order')) } }
      }
    },
    '/orders/table/{tableNumber}': {
      get: {
        tags: ['Cozinha'],
        summary: 'Pedidos de uma mesa',
        parameters: [{ name: 'tableNumber', in: 'path', required: true, schema: { type: 'integer', minimum: 1, example: 5 } }],
        responses: {
          200: { description: 'Lista de pedidos', content: json(list('Order')) },
          400: error('Número da mesa inválido')
        }
      }
    }
  },
  components: {
    schemas: {
      Error: { type: 'object', properties: { message: { type: 'string', example: 'Produto não encontrado.' } } },
      Category: {
        type: 'object',
        properties: { id: uuid, name: { type: 'string' }, description: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } }
      },
      CategoryInput: {
        type: 'object',
        required: ['name', 'description'],
        properties: {
          name: { type: 'string', maxLength: 100, example: 'Sobremesas' },
          description: { type: 'string', maxLength: 500, example: 'Doçura final com sabores italianos clássicos' }
        }
      },
      CategoryUpdate: {
        type: 'object',
        minProperties: 1,
        properties: { name: { type: 'string' }, description: { type: 'string' } }
      },
      Product: {
        type: 'object',
        properties: {
          id: uuid,
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          image: { type: 'string' },
          isAvailable: { type: 'boolean' },
          categoryId: uuid,
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      ProductInput: {
        type: 'object',
        required: ['name', 'description', 'price', 'image', 'categoryId'],
        properties: {
          name: { type: 'string', example: 'Tiramisu' },
          description: { type: 'string', example: 'Clássico italiano com café, mascarpone e cacau.' },
          price: { type: 'number', minimum: 0, example: 21.9 },
          image: { type: 'string', example: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9' },
          isAvailable: { type: 'boolean', default: true },
          categoryId: uuid
        }
      },
      ProductUpdate: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number', minimum: 0, example: 24.9 },
          image: { type: 'string' },
          isAvailable: { type: 'boolean', example: false },
          categoryId: uuid
        }
      },
      OrderStatus: { type: 'string', enum: ['Recebido', 'Preparando', 'Pronto', 'Entregue'] },
      PaymentMethod: { type: 'string', enum: ['PIX', 'Cartão', 'Dinheiro'] },
      OrderItem: {
        type: 'object',
        properties: {
          id: uuid,
          productId: uuid,
          name: { type: 'string' },
          quantity: { type: 'integer' },
          unitPrice: { type: 'number' },
          subtotal: { type: 'number' },
          options: { type: 'array', items: { type: 'string' } }
        }
      },
      Order: {
        type: 'object',
        properties: {
          id: uuid,
          customerName: { type: 'string' },
          tableNumber: { type: 'integer' },
          status: ref('OrderStatus'),
          items: { type: 'array', items: ref('OrderItem') },
          total: { type: 'number' },
          paymentMethod: ref('PaymentMethod'),
          paymentStatus: { type: 'string', enum: ['Aguardando no caixa', 'Pago'] },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      OrderInput: {
        type: 'object',
        required: ['customerName', 'tableNumber', 'items'],
        properties: {
          customerName: { type: 'string', maxLength: 100, example: 'Maria' },
          tableNumber: { type: 'integer', minimum: 1, example: 5 },
          paymentMethod: { allOf: [ref('PaymentMethod')], default: 'Dinheiro' },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              required: ['productId'],
              properties: {
                productId: uuid,
                quantity: { type: 'integer', minimum: 1, maximum: 99, default: 1 },
                options: { type: 'array', items: { type: 'string' }, example: ['Bacon crocante'] }
              }
            }
          }
        }
      }
    }
  }
} as const;
