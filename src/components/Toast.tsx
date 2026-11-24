import { useEffect, useState } from 'react';

const EVENT = 'tabi-toast';

/** 画面の下に短いメッセージを出す */
export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMsg({ text: (e as CustomEvent<string>).detail, key: Date.now() });
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1800);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div key={msg.key} className="toast" role="status">
      {msg.text}
    </div>
  );
}
