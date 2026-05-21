import { describe, it, expect } from 'vitest';
import { filesFromClipboardData } from '@/lib/clipboardImage';

describe('filesFromClipboardData', () => {
  it('returns empty for null data', () => {
    expect(filesFromClipboardData(null)).toEqual([]);
  });

  it('names clipboard files without filename', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])], {
      type: 'image/png',
    });
    const file = new File([blob], '', { type: 'image/png' });

    const items = [
      {
        type: 'image/png',
        getAsFile: () => file,
      },
    ] as unknown as DataTransferItem[];

    const data = { items } as DataTransfer;
    Object.defineProperty(data, 'items', { value: { length: 1, 0: items[0], [Symbol.iterator]: function* () { yield items[0]; } } });

    const files = filesFromClipboardData({
      items: {
        length: 1,
        0: items[0],
        [Symbol.iterator]: function* () {
          yield items[0];
        },
      },
    } as unknown as DataTransfer);

    expect(files).toHaveLength(1);
    expect(files[0].name).toMatch(/^colagem-\d+-0\.png$/);
    expect(files[0].type).toBe('image/png');
  });
});
