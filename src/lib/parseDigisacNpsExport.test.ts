import { describe, expect, it } from 'vitest';
import { parseDigisacNpsExportText } from './parseDigisacNpsExport';

describe('parseDigisacNpsExportText', () => {
  it('parseia TXT tabulado com nota e atendente', () => {
    const txt = [
      'Protocolo\tNota\tTipo\tClassificação\tAtendeu no chamado',
      '1001\t10\tnps\tPromotor\tBeatriz Oliveira',
      '1002\t8\tnps\tNeutro\tFlavia Andreotti',
      '1003\t5\tnps\tDetrator\tBeatriz Oliveira',
    ].join('\n');

    const result = parseDigisacNpsExportText(txt);
    expect(result.overview.total).toBe(3);
    expect(result.overview.promoters.count).toBe(1);
    expect(result.overview.neutrals.count).toBe(1);
    expect(result.overview.detractors.count).toBe(1);
    expect(result.analysts.find((a) => a.name.includes('Beatriz'))?.total).toBe(2);
    expect(result.analysts.find((a) => a.name.includes('Flavia'))?.total).toBe(1);
  });
});
