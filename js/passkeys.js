// js/passkeys.js
import { supabase } from "./supabase.js";
const SITE_URL = location.origin;

async function fetchJSON(url, init={}) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const headers = { ...(init.headers||{}), "Content-Type":"application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// 端末にパスキー登録（platform）
export async function enrollPasskeyPlatform() {
  const opts = await fetchJSON(`${SITE_URL}/functions/v1/webauthn-register-start`);
  // 念のためフロントでも強制
  opts.authenticatorSelection = {
    authenticatorAttachment: "platform",
    residentKey: "preferred",
    userVerification: "required",
  };
  opts.attestation = "none";

  const attResp = await navigator.credentials.create({ publicKey: opts });
  await fetchJSON(`${SITE_URL}/functions/v1/webauthn-register-finish`, {
    method: "POST",
    body: JSON.stringify({ attResp, expectedChallenge: opts.challenge }),
  });
  alert("この端末にパスキーを登録しました。次回は生体認証でログインできます。");
}

// 生体認証でログイン（platform）
export async function loginWithPasskeyPlatform() {
  if (!(window.PublicKeyCredential) ||
      !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
    alert("この端末は生体認証ログインに対応していません。");
    return;
  }
  const opts = await fetchJSON(`${SITE_URL}/functions/v1/webauthn-login-start`);
  opts.userVerification = "required";
  const authResp = await navigator.credentials.get({ publicKey: opts, mediation: "optional" });

  const { user_id } = await fetchJSON(`${SITE_URL}/functions/v1/webauthn-login-finish`, {
    method: "POST",
    body: JSON.stringify({ authResp, expectedChallenge: opts.challenge }),
  });

  // ★ここでセッション確立
  // 最小構成：メールOTPに誘導（完全ワンタップ化したい場合は、追加で Admin API を使うEdge Functionを足す）
  alert("生体認証OK。続けて通常ログイン（メールOTPなど）でセッションを確定してください。");
}
