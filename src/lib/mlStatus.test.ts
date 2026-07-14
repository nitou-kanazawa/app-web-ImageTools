import { describe, it, expect } from 'vitest';
import { statusFromProgressEvent } from './mlStatus';

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

  it('ready で解析中になる', () => {
    expect(statusFromProgressEvent({ status: 'ready' })?.phase).toBe('running');
  });

  it('関心のないイベントは null', () => {
    expect(statusFromProgressEvent({ status: 'done' })).toBeNull();
    expect(statusFromProgressEvent({})).toBeNull();
  });
});
