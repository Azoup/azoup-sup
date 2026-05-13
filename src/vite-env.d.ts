/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true` = recuperação por código (EmailJS + funções password-reset-*-code). */
  readonly VITE_PASSWORD_RESET_VIA_EMAILJS?: string;
}
