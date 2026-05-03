import { supabase, SUPABASE_URL } from "./supabase.js";

const FN = (name) =>
  `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;

function b64uToBuf(b64u) {
  const base64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
  const bin = atob(base64 + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function getTextOrJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function getValidAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    throw new Error("ログインしていません");
  }

  return data.session.access_token;
}

export async function registerPasskey() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      alert("このブラウザはパスキーに対応していません");
      return;
    }

    const token = await getValidAccessToken();

    const startRes = await fetch(FN("webauthn-register-start"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    const startJson = await getTextOrJson(startRes);

    if (!startRes.ok) {
      throw new Error(
        `register-start失敗 ${startRes.status}: ${JSON.stringify(startJson)}`
      );
    }

    const publicKey = {
      ...startJson,
      challenge: b64uToBuf(startJson.challenge),
      user: {
        ...startJson.user,
        id: b64uToBuf(startJson.user.id),
      },
      excludeCredentials: (startJson.excludeCredentials ?? []).map((c) => ({
        ...c,
        id: b64uToBuf(c.id),
      })),
    };

    const credential = await navigator.credentials.create({ publicKey });

    if (!credential) {
      throw new Error("パスキーを作成できませんでした");
    }

    const attResp = {
      id: credential.id,
      rawId: bufToB64(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufToB64(credential.response.clientDataJSON),
        attestationObject: bufToB64(credential.response.attestationObject),
        transports:
          typeof credential.response.getTransports === "function"
            ? credential.response.getTransports()
            : [],
      },
      clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
      authenticatorAttachment: credential.authenticatorAttachment,
    };

    const finishRes = await fetch(FN("webauthn-register-finish"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ attResp }),
    });

    const finishJson = await getTextOrJson(finishRes);

    if (!finishRes.ok) {
      throw new Error(
        `register-finish失敗 ${finishRes.status}: ${JSON.stringify(finishJson)}`
      );
    }

    alert("パスキー登録が完了しました");
  } catch (e) {
    console.error(e);
    alert(`登録に失敗：${e.message || e}`);
  }
}

export async function loginWithPasskey() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      alert("このブラウザはパスキーに対応していません");
      return;
    }

    const startRes = await fetch(FN("webauthn-login-start"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const startJson = await getTextOrJson(startRes);

    if (!startRes.ok) {
      throw new Error(
        `login-start失敗 ${startRes.status}: ${JSON.stringify(startJson)}`
      );
    }

    const pk = startJson.publicKey;

    const publicKey = {
      ...pk,
      challenge: b64uToBuf(pk.challenge),
      allowCredentials: (pk.allowCredentials ?? []).map((c) => ({
        ...c,
        id: b64uToBuf(c.id),
      })),
    };

    const assertion = await navigator.credentials.get({ publicKey });

    if (!assertion) {
      throw new Error("パスキー認証がキャンセルされました");
    }

    const authResp = {
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
      clientExtensionResults: assertion.getClientExtensionResults?.() ?? {},
      authenticatorAttachment: assertion.authenticatorAttachment,
    };

    const finishRes = await fetch(FN("webauthn-login-finish"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ authResp }),
    });

    const finishJson = await getTextOrJson(finishRes);

    if (!finishRes.ok) {
      throw new Error(
        `login-finish失敗 ${finishRes.status}: ${JSON.stringify(finishJson)}`
      );
    }

    if (!finishJson.action_link) {
      throw new Error("ログインリンクを取得できませんでした");
    }

    location.href = finishJson.action_link;
  } catch (e) {
    console.error(e);
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}