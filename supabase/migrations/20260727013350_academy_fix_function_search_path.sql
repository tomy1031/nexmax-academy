-- app.touch_updated_at の search_path を固定する（Supabase security advisor:
-- function_search_path_mutable への対応）。now() は pg_catalog にあるため空でよい。
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
