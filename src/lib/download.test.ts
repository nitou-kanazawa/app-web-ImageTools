import { describe, it, expect } from 'vitest';
import { exportFileName } from './download';

describe('exportFileName', () => {
  it('拡張子を除いて suffix を付ける', () => {
    expect(exportFileName('photo.jpg', 'mask')).toBe('photo_mask.png');
    expect(exportFileName('a.b.c.png', 'cutout')).toBe('a.b.c_cutout.png');
  });

  it('拡張子なし・空文字にも対応する', () => {
    expect(exportFileName('photo', 'mask')).toBe('photo_mask.png');
    expect(exportFileName('', 'mask')).toBe('image_mask.png');
  });
});
