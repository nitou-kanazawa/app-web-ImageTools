import { describe, it, expect } from 'vitest';
import { BG_MODELS, alphaToWhiteMask, isFullyOpaque, statusFromProgressEvent } from './logic';

describe('BG_MODELS', () => {
  it('モデル定義が揃っている', () => {
    expect(BG_MODELS.length).toBeGreaterThanOrEqual(2);
    for (const m of BG_MODELS) {
      expect(m.id).toMatch(/\//); // HF Hub の owner/name 形式
      expect(m.label).not.toBe('');
    }
  });
});

describe('statusFromProgressEvent', () => {
  it('progress イベントを進捗付きステータスへ変換する', () => {
    const s = statusFromProgressEvent({ status: 'progress', file: 'model.onnx', progress: 42.5 });
    expect(s).toEqual({
      phase: 'loading',
      message: 'モデルをダウンロード中... model.onnx',
      progress: 43,
    });
  });

  it('initiate / download はローディング扱い', () => {
    expect(statusFromProgressEvent({ status: 'initiate', file: 'a.json' })?.phase).toBe('loading');
    expect(statusFromProgressEvent({ status: 'download' })?.phase).toBe('loading');
  });

  it('ready で推論中になる', () => {
    expect(statusFromProgressEvent({ status: 'ready' })?.phase).toBe('running');
  });

  it('関心のないイベントは null', () => {
    expect(statusFromProgressEvent({ status: 'done' })).toBeNull();
    expect(statusFromProgressEvent({})).toBeNull();
  });
});

describe('alphaToWhiteMask', () => {
  it('アルファ配列から白マスク RGBA を作る', () => {
    const alpha = new Uint8ClampedArray([200, 0]);
    const out = alphaToWhiteMask(alpha);
    expect(out.length).toBe(8);
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 200]);
    expect([...out.slice(4, 8)]).toEqual([255, 255, 255, 0]);
  });
});

describe('isFullyOpaque', () => {
  it('すべて不透明なら true', () => {
    expect(isFullyOpaque(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(true);
  });

  it('1ピクセルでも透過があれば false', () => {
    expect(isFullyOpaque(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254]))).toBe(false);
  });
});
