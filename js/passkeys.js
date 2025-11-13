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

// すでに書いてある import / 共通関数はそのままでOK
// import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";
// const b64uToBuf, bufToB64 などもそのまま使います

// ==========================
//  パスキーでログイン
// ==========================
export async function loginWithPasskey() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    alert("このブラウザはパスキー（WebAuthn）に対応していません");
    return;
  }

  try {
    // --- 1) start: Edge Function を supabase.functions.invoke で呼ぶ ---
    const { data: startJson, error: startErr } =
      await supabase.functions.invoke("webauthn-login-start", {
        body: {},     // 今回は特にパラメータなし
      });

    if (startErr) {
      console.error("login-start error:", startErr);
      throw new Error(
        `login-start失敗: ${startErr.message || JSON.stringify(startErr)}`
      );
    }

    // Edge Function 側が { publicKey: {...}, challenge: "..."} の形でも、
    // 直接 PublicKeyCredentialRequestOptions でも動くようにしておく
    const pk = startJson.publicKey || startJson;

    // challenge / allowCredentials の base64url → ArrayBuffer 変換
    pk.challenge = b64uToBuf(pk.challenge);
    if (pk.allowCredentials) {
      pk.allowCredentials = pk.allowCredentials.map((c) => ({
        ...c,
        id: b64uToBuf(c.id),
      }));
    }

    // --- 2) ブラウザの WebAuthn API で認証 ---
    const cred = await navigator.credentials.get({ publicKey: pk });
    if (!cred) {
      throw new Error("credential を取得できませんでした");
    }

    const authResp = {
      id: cred.id,
      rawId: bufToB64(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON:    bufToB64(cred.response.clientDataJSON),
        authenticatorData: bufToB64(cred.response.authenticatorData),
        signature:         bufToB64(cred.response.signature),
        userHandle: cred.response.userHandle
          ? bufToB64(cred.response.userHandle)
          : null,
      },
    };

    // --- 3) finish: 認証結果を Edge Function に送る ---
    const { data: finishJson, error: finishErr } =
      await supabase.functions.invoke("webauthn-login-finish", {
        body: {
          authResp,
          expectedChallenge: startJson.challenge ?? startJson.publicKey?.challenge,
        },
      });

    if (finishErr) {
      console.error("login-finish error:", finishErr);
      throw new Error(
        `login-finish失敗: ${finishErr.message || JSON.stringify(finishErr)}`
      );
    }

    if (!finishJson.session) {
      throw new Error(
        `session が返ってきませんでした: ${JSON.stringify(finishJson)}`
      );
    }

    // Supabase のセッションとしてブラウザに保存
    await supabase.auth.setSession(finishJson.session);

    alert("パスキーでログインしました");
    window.location.href = "main.html";
  } catch (e) {
    console.error(e);
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}
