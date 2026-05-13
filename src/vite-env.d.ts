/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true` = recuperação de senha via Edge Function + EmailJS (ver supabase/functions/password-reset-email). */
  readonly VITE_PASSWORD_RESET_VIA_EMAILJS?: string;
}
