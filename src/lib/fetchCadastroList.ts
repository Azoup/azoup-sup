import { supabase } from '@/integrations/supabase/client';
import { mergeCadastroRowsWithPhotoCache } from '@/lib/cadastroPhotoCache';
import { assertSupabaseData } from '@/lib/supabaseQuery';

export async function fetchAnalystsList() {
  const { data, error } = await supabase.from('analysts').select('*').order('name');
  const rows = assertSupabaseData(data, error, 'analysts');
  return mergeCadastroRowsWithPhotoCache('analysts', rows);
}

export async function fetchDevelopersList() {
  const { data, error } = await supabase.from('developers').select('*').order('name');
  const rows = assertSupabaseData(data, error, 'developers');
  return mergeCadastroRowsWithPhotoCache('developers', rows);
}

export async function fetchPeoplePhotos() {
  const [{ data: analysts }, { data: developers }] = await Promise.all([
    supabase.from('analysts').select('name, photo_url'),
    supabase.from('developers').select('name, photo_url'),
  ]);
  return {
    analysts: mergeCadastroRowsWithPhotoCache('analysts', analysts ?? []),
    developers: mergeCadastroRowsWithPhotoCache('developers', developers ?? []),
  };
}
