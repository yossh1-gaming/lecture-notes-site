// js/passkeys.js
import { supabase } from "./supabase.js";

// ▲ supabase.js で SUPABASE_URL を export していればそれを使う。
//   export していない場合でも、下の fallback に自分の URL を1行で入れれば動きます。
import { SUPABASE_URL as EXPORTED_URL } from "./supabase.js"; // ない場合は無視される

// ---- Supabase Edge Functions のベースURLを決める ----
const FALLBACK_SUPABASE_URL = "https://camhjokfxzzelqlirxir.supabase.co"; // ← あなたのURLに置換（DashboardのProject URL）
const BASE = (typeof EXPORTED_URL === "string" && EXPORTED_URL) || FALLBACK_SUPABASE_URL;
const FN = (name) => `${BASE.replace(/\/$/, "")}/functions/v1/${name}`; // ← 末尾スラ無しで連結

async function getValidAccessToken() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("ログインしていません（tokenなし）");
  return session.access_token;
}

const b64uToBuf = (b64u) =>
  Uint8Array.from(atob(b64u.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)).buffer;

export async function registerPasskey() {
  try {
    const token = await getValidAccessToken();

    // --- 1) start: challenge 取得 ---
    const startUrl = FN("webauthn-register-start");           // ← ここで常に正しいURLになる
    console.debug("[passkeys] start URL:", startUrl);         // デバッグ表示
    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,                   // 必須
      },
      body: JSON.stringify({}),
    });
    if (!startRes.ok) throw new Error(`start失敗 ${startRes.status}: ${await startRes.text()}`);
    const pubKey = await startRes.json();

    // --- 2) navigator.credentials.create ---
    const publicKey = {
      ...pubKey,
      challenge: b64uToBuf(pubKey.challenge),
      user: {
        ...pubKey.user,
        id: b64uToBuf(pubKey.user.id),
      },
      excludeCredentials: (pubKey.excludeCredentials || []).map(c => ({
        ...c,
        id: b64uToBuf(c.id),
      })),
    };
    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) throw new Error("credential が取得できませんでした");

    // バイナリ→base64（簡易）
    const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const attResp = {
      id: credential.id,
      rawId: toB64(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: toB64(credential.response.clientDataJSON),
        attestationObject: toB64(credential.response.attestationObject),
      },
    };

    // --- 3) finish: 検証へ ---
    const finishUrl = FN("webauthn-register-finish");
    console.debug("[passkeys] finish URL:", finishUrl);
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
    if (!finishRes.ok) throw new Error(`finish失敗 ${finishRes.status}: ${await finishRes.text()}`);

    alert("パスキー登録が完了しました");
  } catch (e) {
    console.error(e);
    alert(`登録に失敗：${e.message || e}`);
  }
}
