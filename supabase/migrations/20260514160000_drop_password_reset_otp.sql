-- Remove artefactos da recuperação de senha por OTP (refazer fluxo do zero).
DROP TABLE IF EXISTS public.password_reset_codes CASCADE;
DROP FUNCTION IF EXISTS public.lookup_auth_user_id_by_email(text);
