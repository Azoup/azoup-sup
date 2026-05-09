create table if not exists public.kanban_card_files (
  id uuid default gen_random_uuid() primary key,
  card_id uuid not null references public.kanban_cards(id) on delete cascade,
  file_url text not null,
  file_path text not null,
  file_name text not null,
  file_type text,
  file_size integer,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.kanban_card_files enable row level security;

-- Create policies for kanban_card_files
create policy "Authenticated users can view kanban card files"
  on public.kanban_card_files for select
  to authenticated using (true);

create policy "Authenticated users can insert kanban card files"
  on public.kanban_card_files for insert
  to authenticated with check (true);

create policy "Users can delete their own kanban card files"
  on public.kanban_card_files for delete
  to authenticated using (auth.uid() = uploaded_by);

-- Create storage bucket if not exists
insert into storage.buckets (id, name, public)
values ('kanban-files', 'kanban-files', true)
on conflict (id) do nothing;

-- Create storage policies for kanban-files
create policy "Public access to kanban-files"
  on storage.objects for select
  to public using (bucket_id = 'kanban-files');

create policy "Authenticated users can upload to kanban-files"
  on storage.objects for insert
  to authenticated with check (bucket_id = 'kanban-files');

create policy "Users can update their own kanban-files"
  on storage.objects for update
  to authenticated using (bucket_id = 'kanban-files' and auth.uid() = owner);

create policy "Users can delete their own kanban-files"
  on storage.objects for delete
  to authenticated using (bucket_id = 'kanban-files' and auth.uid() = owner);
