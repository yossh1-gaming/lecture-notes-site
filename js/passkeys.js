// js/passkeys.js
import { supabase } from "./supabase.js";
// supabase.js 側で SUPABASE_URL を export しているならそれを使う
import { SUPABASE_URL as EXPORTED_URL } from "./supabase.js";

// ---- Edge Functions のベース URL ----
const FALLBACK_SUPABASE_URL = "https://camhjokfxzzelqlirxir.supabase.co"; // ←自分のプロジェクトURL
const BASE = (typeof EXPORTED_URL === "string" && EXPORTED_URL) || FALLBACK_SUPABASE_URL;
const FN = (name) => `${BASE.replace(/\/$/, "")}/functions/v1/${name}`;

// ---- 共通ヘルパ ----
async function getValidAccessToken() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("ログインしていません（tokenなし）");
  }
  return session.access_token;
}

const b64uToBuf = (b64u) =>
  Uint8Array.from(
    atob(b64u.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  ).buffer;

const toB64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

// ========================================================
//  パスキー登録（設定画面）
// ========================================================
export async function registerPasskey() {
  try {
    const token = await getValidAccessToken();

    // 1) Edge Function: webauthn-register-start
    const startUrl = FN("webauthn-register-start");
    console.debug("[passkeys] register start URL:", startUrl);

    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,   // 登録は認証必須
      },
      body: "{}",
    });

    if (!startRes.ok) {
      const text = await startRes.text();
      throw new Error(`start失敗 ${startRes.status}: ${text}`);
    }

    const pubKey = await startRes.json();

    const publicKey = {
      ...pubKey,
      challenge: b64uToBuf(pubKey.challenge),
      user: {
        ...pubKey.user,
        id: b64uToBuf(pubKey.user.id),
      },
      excludeCredentials: (pubKey.excludeCredentials || []).map((c) => ({
        ...c,
        id: b64uToBuf(c.id),
      })),
    };

    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) throw new Error("credential が取得できませんでした");

    const attResp = {
      id: credential.id,
      rawId: toB64(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: toB64(credential.response.clientDataJSON),
        attestationObject: toB64(credential.response.attestationObject),
      },
    };

    // 3) Edge Function: webauthn-register-finish
    const finishUrl = FN("webauthn-register-finish");
    console.debug("[passkeys] register finish URL:", finishUrl);

    const finishRes = await fetch(finishUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        attResp,
        expectedChallenge: pubKey.challenge,
      }),
    });

    if (!finishRes.ok) {
      const text = await finishRes.text();
      throw new Error(`finish失敗 ${finishRes.status}: ${text}`);
    }

    alert("パスキー登録が完了しました");
  } catch (e) {
    console.error(e);
    alert(`登録に失敗：${e.message || e}`);
  }
}

// ========================================================
//  パスキーでログイン（ログイン画面）
// ========================================================
export async function loginWithPasskey() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    alert("このブラウザはパスキー(WebAuthn)に対応していません。");
    return;
  }

  try {
    // 1) Edge Function: webauthn-login-start （未ログインなので Authorization なし）
    const startUrl = FN("webauthn-login-start");
    console.debug("[passkeys] login start URL:", startUrl);

    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",      // 空のJSON
    });

    const startJson = await startRes.json(); // ★ body は一度だけ読む
    if (!startRes.ok) {
      const msg = startJson.error || startRes.statusText;
      throw new Error(`login-start失敗 ${startRes.status}: ${msg}`);
    }

    const pk = startJson.publicKey;
    pk.challenge = b64uToBuf(pk.challenge);

    // Discoverable Credential 前提 → allowCredentials は空配列のままでOK

    // 2) 認証器から assertion 取得
    const cred = await navigator.credentials.get({ publicKey: pk });
    if (!cred) throw new Error("認証がキャンセルされました。");

    const assertion = {
      id: cred.id,
      rawId: toB64(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: toB64(cred.response.clientDataJSON),
        authenticatorData: toB64(cred.response.authenticatorData),
        signature: toB64(cred.response.signature),
        userHandle: cred.response.userHandle
          ? toB64(cred.response.userHandle)
          : null,
      },
    };

    // 3) Edge Function: webauthn-login-finish
    const finishUrl = FN("webauthn-login-finish");
    console.debug("[passkeys] login finish URL:", finishUrl);

    const finishRes = await fetch(finishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assertion,
        expectedChallenge: startJson.challenge,
      }),
    });

    const result = await finishRes.json();
    if (!finishRes.ok) {
      const msg = result.error || finishRes.statusText;
      throw new Error(`login-finish失敗 ${finishRes.status}: ${msg}`);
    }

    // Edge Function 側で access_token / refresh_token を返す設計にしている前提
    if (result.access_token && result.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (error) throw error;
    }

    alert("パスキーでログインしました");
    location.href = "main.html";
  } catch (e) {
    console.error(e);
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}
