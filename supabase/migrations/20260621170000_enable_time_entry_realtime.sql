do $$
begin
  alter publication supabase_realtime add table public.time_entries;
exception
  when duplicate_object then null;
end;
$$;
