import { supabase } from "./supabase.js";

/* ========= Base64URL ⇄ ArrayBuffer ========= */
const b64uToBytes = (b64u) => {
  const pad = (s) => s + "===".slice((s.length + 3) % 4);
  const b64 = pad(b64u.replace(/-/g, "+").replace(/_/g, "/"));
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const bytesToB64u = (bytes) => {
  let bin = "";
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

/* ========= Edge Functions 呼び出し ========= */
async function callFn(name, body = null, withAuth = false) {
  const headers = {};
  if (withAuth) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const { data, error } = await supabase.functions.invoke(name, { body, headers });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data;
}

/* ========= オプションの型をWebAuthn用に整形 ========= */
function toCreateOpts(serverOpts) {
  return {
    ...serverOpts,
    challenge: b64uToBytes(serverOpts.challenge),
    user: {
      ...serverOpts.user,
      // user.id も ArrayBuffer 必須
      id: b64uToBytes(serverOpts.user.id),
    },
    excludeCredentials: (serverOpts.excludeCredentials || []).map((cred) => ({
      ...cred,
      id: b64uToBytes(cred.id),
    })),
  };
}
function toGetOpts(serverOpts) {
  return {
    ...serverOpts,
    challenge: b64uToBytes(serverOpts.challenge),
    allowCredentials: (serverOpts.allowCredentials || []).map((cred) => ({
      ...cred,
      id: b64uToBytes(cred.id),
    })),
  };
}

/* ========= 登録（パスキー作成） ========= */
export async function enrollPasskeyPlatform() {
  // サーバから “base64url文字列” のオプションを受け取る
  const start = await callFn("webauthn-register-start", null, true);
  // 期待チャレンジは生値（文字列）のまま保持して finish に渡す
  const expectedChallenge = start.challenge;

  // ブラウザに渡す前に ArrayBuffer に変換
  const publicKey = toCreateOpts({
    ...start,
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
    attestation: "none",
  });

  const cred = await navigator.credentials.create({ publicKey });
  // サーバへ送るときはバイナリを base64url で戻す
  const attResp = {
    id: cred.id,
    rawId: bytesToB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bytesToB64u(cred.response.clientDataJSON),
      attestationObject: bytesToB64u(cred.response.attestationObject),
    },
  };

  await callFn(
    "webauthn-register-finish",
    { attResp, expectedChallenge },
    true
  );

  alert("この端末にパスキーを登録しました。");
}

/* ========= ログイン（パスキー使用） ========= */
export async function loginWithPasskeyPlatform() {
  const start = await callFn("webauthn-login-start");
  const expectedChallenge = start.challenge;

  const publicKey = toGetOpts({
    ...start,
    userVerification: "required",
  });

  const assertion = await navigator.credentials.get({ publicKey });
  const authResp = {
    id: assertion.id,
    rawId: bytesToB64u(assertion.rawId),
    type: assertion.type,
    response: {
      clientDataJSON: bytesToB64u(assertion.response.clientDataJSON),
      authenticatorData: bytesToB64u(assertion.response.authenticatorData),
      signature: bytesToB64u(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? bytesToB64u(assertion.response.userHandle)
        : null,
    },
  };

  const { user_id } = await callFn(
    "webauthn-login-finish",
    { authResp, expectedChallenge }
  );

  // ここで supabase.auth.signIn など通常のログイン遷移を続ける実装に接続
  alert("生体認証ログインが検証されました。");
}
