// js/passkeys.js
import { supabase, SUPABASE_URL } from "./supabase.js";

const BASE = SUPABASE_URL; // supabase.jsでexportしてる前提
const FN = (name) => `${BASE.replace(/\/$/, "")}/functions/v1/${name}`;

// ---- helpers ----
const b64uToBuf = (b64u) =>
  Uint8Array.from(
    atob(b64u.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  ).buffer;

const bufToB64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

async function getValidAccessToken(){
  const { data:{session} } = await supabase.auth.getSession();
  if(!session?.access_token) throw new Error("ログインしていません");
  return session.access_token;
}

// --------------------
// パスキー登録（ログイン済みのみ）
// --------------------
export async function registerPasskey(){
  try{
    const token = await getValidAccessToken();

    const startRes = await fetch(FN("webauthn-register-start"),{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const startJson = await startRes.json();
    if(!startRes.ok) throw new Error(startJson.error || "register-start failed");

    const pubKey = {
      ...startJson,
      challenge: b64uToBuf(startJson.challenge),
      user:{
        ...startJson.user,
        id: b64uToBuf(startJson.user.id),
      },
      excludeCredentials:(startJson.excludeCredentials||[]).map(c=>({
        ...c,
        id: b64uToBuf(c.id),
      })),
    };

    const credential = await navigator.credentials.create({ publicKey: pubKey });
    if(!credential) throw new Error("credentialなし");

    const attResp = {
      id: credential.id,
      rawId: bufToB64(credential.rawId),
      type: credential.type,
      response:{
        clientDataJSON: bufToB64(credential.response.clientDataJSON),
        attestationObject: bufToB64(credential.response.attestationObject),
      }
    };

    const finishRes = await fetch(FN("webauthn-register-finish"),{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`,
      },
      body: JSON.stringify({
        attResp,
        expectedChallenge: startJson.challenge,
      })
    });
    const finishJson = await finishRes.json();
    if(!finishRes.ok) throw new Error(finishJson.error || "register-finish failed");

    alert("パスキー登録完了！");
  }catch(e){
    console.error(e);
    alert(`登録失敗: ${e.message||e}`);
  }
}

// --------------------
// パスキーログイン（ログイン前なのでBearer不要）
// --------------------
export async function loginWithPasskey(email){
  try{
    if(!email) throw new Error("メールを入力してね");

    const startRes = await fetch(FN("webauthn-login-start"),{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email }),
    });
    const startJson = await startRes.json();
    if(!startRes.ok) throw new Error(startJson.error || "login-start failed");

    const pk = startJson.publicKey;
    const publicKey = {
      ...pk,
      challenge: b64uToBuf(pk.challenge),
      allowCredentials:(pk.allowCredentials||[]).map(c=>({
        ...c,
        id: b64uToBuf(c.id),
      }))
    };

    const assertion = await navigator.credentials.get({ publicKey });
    if(!assertion) throw new Error("assertionなし");

    const assResp = {
      id: assertion.id,
      rawId: bufToB64(assertion.rawId),
      type: assertion.type,
      response:{
        clientDataJSON: bufToB64(assertion.response.clientDataJSON),
        authenticatorData: bufToB64(assertion.response.authenticatorData),
        signature: bufToB64(assertion.response.signature),
        userHandle: assertion.response.userHandle
          ? bufToB64(assertion.response.userHandle)
          : null,
      }
    };

    const finishRes = await fetch(FN("webauthn-login-finish"),{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        assResp,
        expectedChallenge: startJson.expectedChallenge,
        userId: startJson.userId,
      }),
    });
    const finishJson = await finishRes.json();
    if(!finishRes.ok) throw new Error(finishJson.error || "login-finish failed");

    // finish側でsupabaseのsession相当を返す設計ならセットする
    if(finishJson.session){
      await supabase.auth.setSession(finishJson.session);
    }

    alert("パスキーでログイン成功！");
    location.href="main.html";
  }catch(e){
    console.error(e);
    alert(`パスキーでのログインに失敗: ${e.message||e}`);
  }
}
