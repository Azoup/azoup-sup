-- =====================================================================
-- Atualizar URLs de Storage: ffvgrvrk → ittmglvk
-- Executar no SQL Editor do projeto DESTINO (ittmglvkympbyeowgucl)
-- APÓS copiar os arquivos com migrate-storage-ffvgrvrk-to-ittmglvk.mjs
-- =====================================================================

BEGIN;

UPDATE public.analysts
SET photo_url = replace(photo_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE photo_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

UPDATE public.developers
SET photo_url = replace(photo_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE photo_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

UPDATE public.profiles
SET photo_url = replace(photo_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE photo_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

UPDATE public.kanban_cards
SET image_url = replace(image_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE image_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

UPDATE public.dev_kanban_cards
SET image_url = replace(image_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE image_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

UPDATE public.kanban_card_images
SET image_url = replace(image_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE image_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

UPDATE public.dev_kanban_card_images
SET image_url = replace(image_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE image_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

UPDATE public.kanban_card_files
SET
  file_url = replace(file_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE file_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

UPDATE public.dev_kanban_card_files
SET
  file_url = replace(file_url, 'https://ffvgrvrkuiypjzfdcfyw.supabase.co', 'https://ittmglvkympbyeowgucl.supabase.co')
WHERE file_url LIKE '%ffvgrvrkuiypjzfdcfyw.supabase.co%';

COMMIT;

-- Verificação: deve retornar 0 em todas as linhas
SELECT 'analysts' AS tabela, count(*) AS urls_antigas FROM public.analysts WHERE photo_url LIKE '%ffvgrvrk%'
UNION ALL
SELECT 'developers', count(*) FROM public.developers WHERE photo_url LIKE '%ffvgrvrk%'
UNION ALL
SELECT 'profiles', count(*) FROM public.profiles WHERE photo_url LIKE '%ffvgrvrk%'
UNION ALL
SELECT 'kanban_cards', count(*) FROM public.kanban_cards WHERE image_url LIKE '%ffvgrvrk%'
UNION ALL
SELECT 'dev_kanban_cards', count(*) FROM public.dev_kanban_cards WHERE image_url LIKE '%ffvgrvrk%'
UNION ALL
SELECT 'kanban_card_images', count(*) FROM public.kanban_card_images WHERE image_url LIKE '%ffvgrvrk%'
UNION ALL
SELECT 'dev_kanban_card_images', count(*) FROM public.dev_kanban_card_images WHERE image_url LIKE '%ffvgrvrk%'
UNION ALL
SELECT 'kanban_card_files', count(*) FROM public.kanban_card_files WHERE file_url LIKE '%ffvgrvrk%'
UNION ALL
SELECT 'dev_kanban_card_files', count(*) FROM public.dev_kanban_card_files WHERE file_url LIKE '%ffvgrvrk%';
