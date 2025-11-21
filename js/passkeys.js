// js/passkeys.js
import { supabase, SUPABASE_URL as EXPORTED_URL } from "./supabase.js";

const FALLBACK_SUPABASE_URL = "https://camhjokfxzzelqlirxir.supabase.co";
const BASE = (EXPORTED_URL && typeof EXPORTED_URL === "string")
  ? EXPORTED_URL
  : FALLBACK_SUPABASE_URL;

const FN = (name) =>
  `${BASE.replace(/\/$/, "")}/functions/v1/${name}`;

const b64uToBuf = (b64u) =>
  Uint8Array.from(
    atob(b64u.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  ).buffer;

const bufToB64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

async function getValidAccessToken() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("ログインしていません");
  return session.access_token;
}

// ========================
//  登録
// ========================
export async function registerPasskey() {
  try {
    const token = await getValidAccessToken();

    const startRes = await fetch(FN("webauthn-register-start"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: "{}",
    });

    if (!startRes.ok) {
      throw new Error(`register-start失敗 ${startRes.status}: ${await startRes.text()}`);
    }

    const pubKey = await startRes.json();

    const publicKey = {
      ...pubKey,
      challenge: b64uToBuf(pubKey.challenge),
      user: { ...pubKey.user, id: b64uToBuf(pubKey.user.id) },
      excludeCredentials: (pubKey.excludeCredentials || []).map(c => ({
        ...c, id: b64uToBuf(c.id)
      })),
    };

    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) throw new Error("credentialが取得できません");

    const attResp = {
      id: credential.id,
      rawId: bufToB64(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufToB64(credential.response.clientDataJSON),
        attestationObject: bufToB64(credential.response.attestationObject),
      },
    };

    const finishRes = await fetch(FN("webauthn-register-finish"), {
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
      throw new Error(`register-finish失敗 ${finishRes.status}: ${await finishRes.text()}`);
    }

    alert("パスキー登録が完了しました（本番ドメインでのみ有効）");
  } catch (e) {
    console.error(e);
    alert(`登録に失敗：${e.message || e}`);
  }
}

// ========================
//  ログイン
// ========================
export async function loginWithPasskey() {
  try {
    // --- start（認証不要） ---
    const startRes = await fetch(FN("webauthn-login-start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    if (!startRes.ok) {
      throw new Error(`login-start失敗 ${startRes.status}: ${await startRes.text()}`);
    }

    const { publicKey } = await startRes.json();

    const pk = {
      ...publicKey,
      challenge: b64uToBuf(publicKey.challenge),
      allowCredentials: (publicKey.allowCredentials || []).map(c => ({
        ...c, id: b64uToBuf(c.id),
      })),
    };

    const assertion = await navigator.credentials.get({ publicKey: pk });
    if (!assertion) throw new Error("assertion が取得できません");

    const assResp = {
      id: assertion.id,
      rawId: bufToB64(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: bufToB64(assertion.response.clientDataJSON),
        authenticatorData: bufToB64(assertion.response.authenticatorData),
        signature: bufToB64(assertion.response.signature),
        userHandle: assertion.response.userHandle
          ? bufToB64(assertion.response.userHandle)
          : null,
      },
    };

    // --- finish（ここでSupabaseセッション化） ---
    const finishRes = await fetch(FN("webauthn-login-finish"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assResp,
        expectedChallenge: publicKey.challenge,
      }),
    });

    if (!finishRes.ok) {
      throw new Error(`login-finish失敗 ${finishRes.status}: ${await finishRes.text()}`);
    }

    const { access_token, refresh_token } = await finishRes.json();

    // Supabaseセッションに差し込む
    await supabase.auth.setSession({ access_token, refresh_token });

    location.href = "main.html";
  } catch (e) {
    console.error(e);
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}
