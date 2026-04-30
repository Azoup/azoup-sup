-- 1. Garante que o tipo app_role existe (ignora se já existir)
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Cria a função has_role corretamente para aceitar (uuid, app_role)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. Remove as políticas incorretas (se existirem)
DROP POLICY IF EXISTS "Allow admin to delete analysts" ON public.analysts;
DROP POLICY IF EXISTS "Allow admin to delete developers" ON public.developers;

-- 4. Recria as políticas usando a função que acabamos de garantir que existe
CREATE POLICY "Allow admin to delete analysts" 
ON public.analysts 
FOR DELETE 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Allow admin to delete developers" 
ON public.developers 
FOR DELETE 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
