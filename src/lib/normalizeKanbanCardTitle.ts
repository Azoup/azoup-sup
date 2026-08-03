/** Normaliza o título do card no momento de gravar (sempre maiúsculas). */
export function normalizeKanbanCardTitle(title: string): string {
  return title.trim().toLocaleUpperCase('pt-BR');
}
