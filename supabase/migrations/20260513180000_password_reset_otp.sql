-- Códigos OTP para redefinição de senha (sem link por e-mail do Supabase/Lovable).
-- Acesso apenas via service_role (Edge Functions); RLS sem políticas públicas.

CREATE TABLE public.password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_codes_email_idx ON public.password_reset_codes (lower(trim(email)));
CREATE INDEX password_reset_codes_expires_idx ON public.password_reset_codes (expires_at);

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.password_reset_codes IS 'OTP de recuperação de senha; escrita/leitura só pela service_role (Edge Functions).';

-- Resolve auth.users.id por e-mail (só service_role pode executar).
CREATE OR REPLACE FUNCTION public.lookup_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_auth_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_auth_user_id_by_email(text) TO service_role;
