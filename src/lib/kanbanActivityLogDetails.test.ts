import { describe, expect, it } from 'vitest';
import {
  buildDevKanbanEditActivityDetails,
  formatActivityTextChange,
  joinActivityDetails,
} from './kanbanActivityLogDetails';

describe('kanbanActivityLogDetails', () => {
  it('formats text field before and after', () => {
    expect(formatActivityTextChange('Descrição', 'texto antigo', 'texto novo')).toBe(
      '• Descrição: "texto antigo" → "texto novo"',
    );
  });

  it('builds dev kanban edit details with multiple changes', () => {
    const details = buildDevKanbanEditActivityDetails({
      ticketRef: '#0005 MAR NEGRO - BUG',
      titleFrom: 'MAR NEGRO - BUG',
      titleTo: 'MAR NEGRO - BUG',
      descriptionFrom: 'Erro ao salvar',
      descriptionTo: 'Erro ao salvar pedido',
      devNotesFrom: '',
      devNotesTo: 'Corrigido validação',
      analystFromId: 'a1',
      analystToId: 'a1',
      developerFromId: null,
      developerToId: 'd1',
      statusFrom: 'backlog',
      statusTo: 'em-andamento',
      labelNamesFrom: ['Bug'],
      labelNamesTo: ['Bug', 'Prioridade'],
      analysts: [{ id: 'a1', name: 'Maria' }],
      developers: [{ id: 'd1', name: 'João' }],
      columns: [
        { slug: 'backlog', title: 'Backlog' },
        { slug: 'em-andamento', title: 'Em andamento' },
      ],
    });

    expect(details).toContain('Ticket: #0005 MAR NEGRO - BUG');
    expect(details).toContain('Descrição: "Erro ao salvar" → "Erro ao salvar pedido"');
    expect(details).toContain('Observações DEV:');
    expect(details).toContain('Desenvolvedor: (vazio) → João');
    expect(details).toContain('Lista: Backlog → Em andamento');
    expect(details).toContain('Etiquetas: Bug → Bug, Prioridade');
  });

  it('returns fallback when no tracked changes', () => {
    const details = joinActivityDetails('Ticket X', []);
    expect(details).toContain('Sem alterações nos campos principais');
  });
});
