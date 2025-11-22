import { supabase, SUPABASE_URL } from "./supabase.js";

// ---- Edge Functions URL ----
const BASE = SUPABASE_URL.replace(/\/$/, "");
const FN = (name) => `${BASE}/functions/v1/${name}`;

const b64uToBuf = (b64u) =>
  Uint8Array.from(
    atob(b64u.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  ).buffer;

const toB64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

async function getAccessTokenOrThrow() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("ログインしていません");
  return session.access_token;
}

// ========================
//  パスキー登録（ログイン必須）
// ========================
export async function registerPasskey() {
  try {
    const token = await getAccessTokenOrThrow();

    // 1) start
    const startRes = await fetch(FN("webauthn-register-start"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: "{}",
    });

    const startJson = await startRes.json();
    if (!startRes.ok) {
      throw new Error(`start失敗 ${startRes.status}: ${startJson.error || JSON.stringify(startJson)}`);
    }

    const publicKey = {
      ...startJson,
      challenge: b64uToBuf(startJson.challenge),
      user: {
        ...startJson.user,
        id: b64uToBuf(startJson.user.id),
      },
      excludeCredentials: (startJson.excludeCredentials || []).map(c => ({
        ...c,
        id: b64uToBuf(c.id),
      })),
    };

    // 2) create
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

    // 3) finish
    const finishRes = await fetch(FN("webauthn-register-finish"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        attResp,
        expectedChallenge: startJson.challenge,
      }),
    });

    const finishJson = await finishRes.json();
    if (!finishRes.ok) {
      throw new Error(`finish失敗 ${finishRes.status}: ${finishJson.error || JSON.stringify(finishJson)}`);
    }

    alert("パスキー登録が完了しました");
  } catch (e) {
    console.error(e);
    alert(`登録に失敗：${e.message || e}`);
  }
}

// ========================
//  パスキーでログイン（未ログインOK）
// ========================
export async function loginWithPasskey() {
  try {
    if (!window.PublicKeyCredential) {
      alert("このブラウザはパスキーに対応していません");
      return;
    }

    // 1) login-start（public）
    const startRes = await fetch(FN("webauthn-login-start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const startJson = await startRes.json();
    if (!startRes.ok) {
      throw new Error(`login-start失敗 ${startRes.status}: ${startJson.error || JSON.stringify(startJson)}`);
    }

    const publicKey = {
      ...startJson,
      challenge: b64uToBuf(startJson.challenge),
      allowCredentials: (startJson.allowCredentials || []).map(c => ({
        ...c,
        id: b64uToBuf(c.id),
      })),
    };

    // 2) get
    const assertion = await navigator.credentials.get({ publicKey });
    if (!assertion) throw new Error("assertion取得に失敗");

    const asrResp = {
      id: assertion.id,
      rawId: toB64(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: toB64(assertion.response.clientDataJSON),
        authenticatorData: toB64(assertion.response.authenticatorData),
        signature: toB64(assertion.response.signature),
        userHandle: assertion.response.userHandle
          ? toB64(assertion.response.userHandle)
          : null,
      },
    };

    // 3) login-finish（public）
    const finishRes = await fetch(FN("webauthn-login-finish"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asrResp,
        expectedChallenge: startJson.challenge,
      }),
    });

    const finishJson = await finishRes.json();
    if (!finishRes.ok) {
      throw new Error(`login-finish失敗 ${finishRes.status}: ${finishJson.error || JSON.stringify(finishJson)}`);
    }

    // finish 側で supabase session 情報を返す実装ならここで setSession
    if (finishJson?.session) {
      await supabase.auth.setSession(finishJson.session);
    }

    alert("パスキーでログインしました");
    location.href = "main.html";
  } catch (e) {
    console.error(e);
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}
