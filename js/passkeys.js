// js/passkeys.js
import { supabase } from "./supabase.js";
import { SUPABASE_URL as EXPORTED_URL } from "./supabase.js";

// ---- Supabase Edge Functions のベースURL ----
const FALLBACK_SUPABASE_URL = "https://camhjokfxzzelqlirxir.supabase.co"; // ← プロジェクトURL
const BASE = (typeof EXPORTED_URL === "string" && EXPORTED_URL) || FALLBACK_SUPABASE_URL;
const FN = (name) => `${BASE.replace(/\/$/, "")}/functions/v1/${name}`;

// ---------------- 共通ヘルパ ----------------

async function getValidAccessToken() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("ログインしていません（tokenなし）");
  return session.access_token;
}

// base64url → ArrayBuffer
const b64uToBuf = (b64u) =>
  Uint8Array.from(
    atob(b64u.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  ).buffer;

// ArrayBuffer → base64url
const bufToB64u = (buf) => {
  const u8 = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

// ArrayBuffer → 通常 base64（登録の finish で使用）
const bufToB64 = (buf) => {
  const u8 = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
};

// =====================================================
//  パスキー登録（すでに動いている処理をそのまま利用）
// =====================================================
export async function registerPasskey() {
  try {
    const token = await getValidAccessToken();

    // --- 1) start: challenge 取得 ---
    const startUrl = FN("webauthn-register-start");
    console.debug("[passkeys] register start URL:", startUrl);
    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // 要トークン
      },
      body: JSON.stringify({}),
    });
    if (!startRes.ok) {
      throw new Error(`start失敗 ${startRes.status}: ${await startRes.text()}`);
    }
    const pubKey = await startRes.json();

    // --- 2) navigator.credentials.create ---
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

    // --- 3) finish: 検証へ ---
    const finishUrl = FN("webauthn-register-finish");
    console.debug("[passkeys] register finish URL:", finishUrl);
    const finishRes = await fetch(finishUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        attResp,
        expectedChallenge: pubKey.challenge,
      }),
    });

    if (!finishRes.ok) {
      throw new Error(`finish失敗 ${finishRes.status}: ${await finishRes.text()}`);
    }

    alert("パスキー登録が完了しました");
  } catch (e) {
    console.error(e);
    alert(`登録に失敗：${e.message || e}`);
  }
}

// =====================================================
//  パスキーでログイン
//   - webauthn-login-start (POST, 認証不要)
//   - navigator.credentials.get
//   - webauthn-login-finish (POST, 認証不要)
// =====================================================
export async function loginWithPasskey() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    alert("このブラウザはパスキー（WebAuthn）に対応していません。");
    return;
  }

  try {
    // --- 1) start: PublicKeyCredentialRequestOptions 取得 ---
    const startUrl = FN("webauthn-login-start");
    console.debug("[passkeys] login start URL:", startUrl);

    const startRes = await fetch(startUrl, {
      method : "POST",
      headers : {"Content-Type":"application/json"},
      body : "{}"
    });
    let startJson;
    try{
      startJson = await startRes.json();
    } catch {
      startJson = {};
    }
    if (!startRes.ok){
      const msg = startJson.error || JSON.stringify(startJson) || startRes.statusText;
      throw new Error(`login-start失敗 ${startRes.status}: ${msg}`);
    }

    const pk = startJson.publicKey;
    const challengeB64u = pk.challenge; // 後でサーバに送り返す用
    pk.challenge = b64uToBuf(pk.challenge);

    // Discoverable Credential 前提なので allowCredentials は空のままでOK

    // --- 2) 生体認証ダイアログ ---
    const cred = await navigator.credentials.get({ publicKey: pk });
    if (!cred) throw new Error("credential が取得できませんでした（ログイン）");

    // --- 3) finish: Edge Function へ送信し、Magic Link をもらう ---
    const payload = {
      id: cred.id,
      type: cred.type,
      rawId: bufToB64u(cred.rawId),
      response: {
        clientDataJSON: bufToB64u(cred.response.clientDataJSON),
        authenticatorData: bufToB64u(cred.response.authenticatorData),
        signature: bufToB64u(cred.response.signature),
        userHandle: cred.response.userHandle
          ? bufToB64u(cred.response.userHandle)
          : null,
      },
      clientChallenge: challengeB64u,
    };

    const finishUrl = FN("webauthn-login-finish");
    console.debug("[passkeys] login finish URL:", finishUrl);

    const finRes = await fetch(finishUrl, {
      method : "POST",
      headers : {"Content-Type":"application/json"},
      body : "{}"
    });
    let finJson;
    try{
      finJson = await finRes.json();
    } catch {
      finJson = {};
    }
    if (!finRes.ok){
      const msg = finJson.error || JSON.stringify(finJson) || finRes.statusText;
      throw new Error(`login-finish失敗 ${finRes.status}: ${msg}`);
    }

    if (!finRes.ok) {
      throw new Error
    }

    if (!finJson.action_link) {
      throw new Error("応答に action_link が含まれていません。");
    }

    // Magic Link へリダイレクト → Supabase セッションが作成される
    location.href = finJson.action_link;
  } catch (e) {
    console.error(e);
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}
