// js/passkeys.js
import { supabase } from "./supabase.js";
import { SUPABASE_URL as EXPORTED_URL } from "./supabase.js";

const FALLBACK_SUPABASE_URL = "https://camhjokfxzzelqlirxir.supabase.co";
const BASE = (typeof EXPORTED_URL === "string" && EXPORTED_URL) || FALLBACK_SUPABASE_URL;
const FN = (name) => `${BASE.replace(/\/$/, "")}/functions/v1/${name}`;

async function getValidAccessToken() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("ログインしていません（tokenなし）");
  return session.access_token;
}

const b64uToBuf = (b64u) =>
  Uint8Array.from(atob(b64u.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)).buffer;

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export async function registerPasskey() {
  try {
    const token = await getValidAccessToken();

    // 1) start（Bearer 必須）
    const startRes = await fetch(FN("webauthn-register-start"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: "{}",
    });
    if (!startRes.ok) throw new Error(`start失敗 ${startRes.status}: ${await startRes.text()}`);
    const pubKey = await startRes.json();

    const publicKey = {
      ...pubKey,
      challenge: b64uToBuf(pubKey.challenge),
      user: { ...pubKey.user, id: b64uToBuf(pubKey.user.id) },
      excludeCredentials: (pubKey.excludeCredentials || []).map(c => ({ ...c, id: b64uToBuf(c.id) })),
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

    // 2) finish（Bearer 必須）
    const finishRes = await fetch(FN("webauthn-register-finish"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ attResp, expectedChallenge: pubKey.challenge }),
    });
    if (!finishRes.ok) throw new Error(`finish失敗 ${finishRes.status}: ${await finishRes.text()}`);

    alert("パスキー登録が完了しました");
  } catch (e) {
    alert(`登録に失敗：${e.message || e}`);
  }
}

export async function loginWithPasskey() {
  try {
    // 1) login-start（Bearer 付けない！）
    const startRes = await fetch(FN("webauthn-login-start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!startRes.ok) throw new Error(`login-start失敗 ${startRes.status}: ${await startRes.text()}`);
    const { publicKey } = await startRes.json();

    const pk = {
      ...publicKey,
      challenge: b64uToBuf(publicKey.challenge),
      allowCredentials: (publicKey.allowCredentials || []).map(c => ({
        ...c,
        id: b64uToBuf(c.id),
      })),
    };

    const assertion = await navigator.credentials.get({ publicKey: pk });
    if (!assertion) throw new Error("assertion が取得できませんでした");

    const getResp = {
      id: assertion.id,
      rawId: toB64(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: toB64(assertion.response.clientDataJSON),
        authenticatorData: toB64(assertion.response.authenticatorData),
        signature: toB64(assertion.response.signature),
        userHandle: assertion.response.userHandle ? toB64(assertion.response.userHandle) : null,
      },
    };

    // 2) login-finish（Bearer 付けない）
    const finishRes = await fetch(FN("webauthn-login-finish"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ getResp, expectedChallenge: publicKey.challenge }),
    });
    if (!finishRes.ok) throw new Error(`login-finish失敗 ${finishRes.status}: ${await finishRes.text()}`);

    const data = await finishRes.json();
    // ここで finish が返す session を supabase.auth.setSession(...) する実装に合わせてね
    // 例: await supabase.auth.setSession(data.session)

    alert("パスキーでログインしました");
    location.href = "main.html";
  } catch (e) {
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}
