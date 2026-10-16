-- Modelo de RLS (Postgres / Supabase), para quando o projeto tiver banco. Hoje não tem.
-- Adapte o nome da tabela e a coluna de dono. Exemplo: tabela "items" com coluna "user_id".

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE items FORCE ROW LEVEL SECURITY;

CREATE POLICY "items_select_own" ON items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "items_insert_own" ON items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "items_update_own" ON items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "items_delete_own" ON items
  FOR DELETE USING (auth.uid() = user_id);
