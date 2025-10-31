// js/passkeys.js
import { supabase } from "./supabase.js";

async function getValidAccessToken() {
  // 現在のセッションを取得（必要なら自動で更新される）
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("ログインしていません（トークン取得失敗）");
  }
  return session.access_token;
}

// 「この端末にパスキーを登録」ボタン
export async function registerPasskey() {
  try {
    const token = await getValidAccessToken();

    // 1) Edge Function: register-start（challenge 取得）
    const startRes = await fetch(
      "https://<your-project-ref>.supabase.co/functions/v1/webauthn-register-start",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,        // ★必須
        },
        body: JSON.stringify({}),                     // 必要なら任意パラメータ
      }
    );
    if (!startRes.ok) {
      const msg = await startRes.text();
      throw new Error(`start失敗: ${startRes.status} ${msg}`);
    }
    const pubKey = await startRes.json();

    // 2) 受け取った base64url を ArrayBuffer に変換して navigator.credentials.create に渡す
    const toBuf = (b64u) => Uint8Array.from(atob(b64u.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)).buffer;
    const creationOptions = {
      publicKey: {
        ...pubKey,
        challenge: toBuf(pubKey.challenge),
        user: {
          ...pubKey.user,
          id: toBuf(pubKey.user.id),   // 文字列→ArrayBuffer
        },
        excludeCredentials: (pubKey.excludeCredentials || []).map(c => ({
          ...c,
          id: toBuf(c.id),
        })),
      }
    };

    const credential = await navigator.credentials.create(creationOptions);
    if (!credential) throw new Error("credential が得られませんでした");

    // 3) Edge Function: register-finish（検証に必要な情報を送る）
    const attResp = {
      id: credential.id,
      rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
      type: credential.type,
      response: {
        clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))),
        attestationObject: btoa(String.fromCharCode(...new Uint8Array(credential.response.attestationObject))),
      },
    };

    const finishRes = await fetch(
      "https://<your-project-ref>.supabase.co/functions/v1/webauthn-register-finish",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,        // ★必須
        },
        body: JSON.stringify({
          attResp,
          expectedChallenge: pubKey.challenge,       // 検証用に戻す
        }),
      }
    );
    if (!finishRes.ok) {
      const msg = await finishRes.text();
      throw new Error(`finish失敗: ${finishRes.status} ${msg}`);
    }

    alert("パスキー登録が完了しました");
  } catch (e) {
    console.error(e);
    alert(`登録に失敗：${e.message || e}`);
  }
}
