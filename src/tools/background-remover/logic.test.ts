import { describe, it, expect } from 'vitest';
import {
  BG_MODELS,
  alphaToWhiteMask,
  countTransparentPixels,
  statusFromProgressEvent,
} from './logic';

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
  it('アルファを引き継いだ白マスクを作る', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 200, 40, 50, 60, 0]);
    const out = alphaToWhiteMask(src);
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 200]);
    expect([...out.slice(4, 8)]).toEqual([255, 255, 255, 0]);
  });
});

describe('countTransparentPixels', () => {
  it('アルファ 255 未満のピクセルを数える', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 254, 0, 0, 0, 0]);
    expect(countTransparentPixels(src)).toBe(2);
  });
});
