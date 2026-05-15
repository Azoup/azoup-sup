/** Mensagem amigável para erros do signInWithPassword / signUp. */
export function formatAuthErrorMessage(error: { message?: string; status?: number; name?: string }): string {
  const msg = (error.message ?? '').toLowerCase();
  const status = error.status;

  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return 'Email ou senha incorretos.';
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return 'Confirme o seu email antes de entrar (verifique a caixa de entrada).';
  }
  if (msg.includes('too many requests') || status === 429) {
    return 'Muitas tentativas seguidas. Aguarde um minuto e tente novamente.';
  }
  if (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    error.name === 'AuthRetryableFetchError'
  ) {
    return 'Falha de ligação ao servidor de autenticação. Verifique a internet e tente de novo.';
  }

  return error.message || 'Não foi possível entrar. Tente novamente.';
}
