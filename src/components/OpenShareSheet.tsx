import { useState } from 'react';
import { extractShareData } from '../lib/share';
import { navigate } from '../router';
import { Sheet } from './Sheet';

/** 共有リンクを貼り付けて開く（ホーム画面のアプリでリンクを受け取るため） */
export function OpenShareSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const open = (t: string) => {
    const data = extractShareData(t);
    if (!data) return setError('共有リンクが見つからないか、途中で切れています。リンク全体をコピーしてください。');
    onClose();
    navigate({ name: 'share', data });
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      open(t);
    } catch {
      setError('貼り付けできませんでした。下の欄を長押しして「ペースト」してください。');
    }
  };

  return (
    <Sheet title="共有リンクを開く" onClose={onClose}>
      <div className="form">
        <p className="muted small">
          LINE などで届いた共有リンクをコピーして、ここに貼り付けてください。iPhone では、リンクをタップすると Safari で開くので、ホーム画面のアプリに入れるときはこの方法を使います。
        </p>
        {typeof navigator.clipboard?.readText === 'function' && (
          <button type="button" className="btn btn-primary btn-block" onClick={paste}>
            📋 コピーしたリンクを貼り付けて開く
          </button>
        )}
        <label className="field">
          <span className="label">または、ここに貼り付け（メッセージごとでも大丈夫）</span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            rows={4}
            placeholder="https://…/#share=…"
          />
        </label>
        {error && (
          <p className="errors" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-ghost btn-block" onClick={() => open(text)} disabled={!text.trim()}>
          開く
        </button>
      </div>
    </Sheet>
  );
}
