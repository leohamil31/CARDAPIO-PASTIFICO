/**
 * Configuração do front-end do Pastifico.
 *
 * mode:
 *  - 'auto'     → usa a API Node.js quando ela estiver no ar (npm run dev) e,
 *                 caso contrário (ex.: GitHub Pages), fala direto com o Supabase.
 *  - 'api'      → sempre a API REST (Express).
 *  - 'supabase' → sempre o Supabase.
 *
 * A chave abaixo é a chave PUBLICÁVEL do Supabase: ela foi feita para ficar no
 * navegador. A segurança está no banco (RLS somente leitura + funções
 * create_order / update_order_status com PIN). NUNCA coloque aqui a service role key.
 */
window.PASTIFICO_CONFIG = {
  mode: 'auto',
  supabaseUrl: 'https://kuklbewivudmgtqzhmhh.supabase.co',
  supabaseKey: 'sb_publishable_9ENAZQFWXUJqDrUcpF-CFA_afMzLRTn'
};
