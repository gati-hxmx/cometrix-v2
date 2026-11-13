"use client";

/**
 * 「できませんでした」のお知らせ（基本 8-1）。画面の下に出し、自分で ✕ を押すまで消えない。
 * いまのお知らせはどれも操作の失敗なので、種類はこの1つだけ。
 */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="toast">
      <p>! {message}</p>
      <button type="button" aria-label="お知らせを閉じる" title="閉じる" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
