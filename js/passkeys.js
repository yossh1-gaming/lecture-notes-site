// js/passkeys.js
import { supabase } from "./supabase.js";
// supabase.js 側で SUPABASE_URL を export しているならそれを使う
import { SUPABASE_URL as EXPORTED_URL } from "./supabase.js";

// ---- Edge Functions のベース URL ----
const FALLBACK_SUPABASE_URL = "https://camhjokfxzzelqlirxir.supabase.co"; // ← あなたのプロジェクトURL
const BASE = (typeof EXPORTED_URL === "string" && EXPORTED_URL) || FALLBACK_SUPABASE_URL;
const FN = (name) => `${BASE.replace(/\/$/, "")}/functions/v1/${name}`;

// ==========================
// 共通ヘルパ
// ==========================
async function getValidAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("ログインしていません（token なし）");
  }
  return session.access_token;
}

// base64url → ArrayBuffer
function b64uToBuf(b64u) {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ArrayBuffer → base64
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ==========================
// パスキー登録（設定画面）
// ==========================
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
        Authorization: `Bearer ${token}`, // 認証必須
      },
      body: "{}",
    });

    if (!startRes.ok) {
      const text = await startRes.text().catch(() => "");
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
      rawId: bufToB64(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufToB64(credential.response.clientDataJSON),
        attestationObject: bufToB64(credential.response.attestationObject),
      },
    };

    // 3) Edge Function: webauthn-register-finish
    const finishUrl = FN("webauthn-register-finish");
    console.debug("[passkeys] register finish URL:", finishUrl);

    const finishRes = await fetch(finishUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // これも認証あり
      },
      body: JSON.stringify({
        attResp,
        expectedChallenge: pubKey.challenge,
      }),
    });

    if (!finishRes.ok) {
      const text = await finishRes.text().catch(() => "");
      throw new Error(`finish失敗 ${finishRes.status}: ${text}`);
    }

    alert("パスキー登録が完了しました");
  } catch (e) {
    console.error(e);
    alert(`登録に失敗：${e.message || e}`);
  }
}

// ==========================
// パスキーでログイン
// ==========================
export async function loginWithPasskey() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    alert("このブラウザはパスキー（WebAuthn）に対応していません");
    return;
  }

  try {
    // 1) Edge Function: webauthn-login-start
    const startUrl = FN("webauthn-login-start");
    console.debug("[passkeys] login start URL:", startUrl);

    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}", // 今回はパラメータなし想定
    });

    if (!startRes.ok) {
      const text = await startRes.text().catch(() => "");
      throw new Error(`login-start失敗 ${startRes.status}: ${text}`);
    }

    const startJson = await startRes.json();

    // サーバー側が { publicKey: {...}, challenge:"..." } でも、
    // 直接 PublicKeyCredentialRequestOptions でも動くようにする
    const pk = startJson.publicKey || startJson;

    pk.challenge = b64uToBuf(pk.challenge);
    if (pk.allowCredentials) {
      pk.allowCredentials = pk.allowCredentials.map((c) => ({
        ...c,
        id: b64uToBuf(c.id),
      }));
    }

    // 2) WebAuthn 認証
    const cred = await navigator.credentials.get({ publicKey: pk });
    if (!cred) throw new Error("credential を取得できませんでした");

    const authResp = {
      id: cred.id,
      rawId: bufToB64(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: bufToB64(cred.response.clientDataJSON),
        authenticatorData: bufToB64(cred.response.authenticatorData),
        signature: bufToB64(cred.response.signature),
        userHandle: cred.response.userHandle
          ? bufToB64(cred.response.userHandle)
          : null,
      },
    };

    // 3) Edge Function: webauthn-login-finish
    const finishUrl = FN("webauthn-login-finish");
    console.debug("[passkeys] login finish URL:", finishUrl);

    const finishRes = await fetch(finishUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authResp,
        expectedChallenge:
          startJson.challenge ?? startJson.publicKey?.challenge,
      }),
    });

    if (!finishRes.ok) {
      const text = await finishRes.text().catch(() => "");
      throw new Error(`login-finish失敗 ${finishRes.status}: ${text}`);
    }

    const finishJson = await finishRes.json();

    if (!finishJson.session) {
      throw new Error(
        `session が返ってきませんでした: ${JSON.stringify(finishJson)}`
      );
    }

    // Supabase のセッションとして保存
    await supabase.auth.setSession(finishJson.session);

    alert("パスキーでログインしました");
    window.location.href = "main.html";
  } catch (e) {
    console.error(e);
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}
