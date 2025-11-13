// --- パスキーでログイン ---
export async function loginWithPasskey() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    alert("このブラウザはパスキー(WebAuthn)に対応していません。");
    return;
  }
  try {
    // 1) start: 取得
    const startUrl = FN("webauthn-login-start");
    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const startJson = await startRes.json();
    if (!startRes.ok) throw new Error(`login-start失敗 ${startRes.status}: ${startJson?.error || startRes.statusText}`);

    const pk = startJson.publicKey;
    // バイナリ変換
    const b64uToBuf = (b64u) =>
      Uint8Array.from(atob(b64u.replace(/-/g,"+").replace(/_/g,"/")), c=>c.charCodeAt(0)).buffer;
    pk.challenge = b64uToBuf(pk.challenge);

    // 2) 認証器から assertion 取得
    const cred = await navigator.credentials.get({ publicKey: pk });
    if (!cred) throw new Error("認証がキャンセルされました。");

    const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const assertion = {
      id: cred.id,
      rawId: toB64(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: toB64(cred.response.clientDataJSON),
        authenticatorData: toB64(cred.response.authenticatorData),
        signature: toB64(cred.response.signature),
        userHandle: cred.response.userHandle ? toB64(cred.response.userHandle) : null,
      },
    };

    // 3) finish（※ここも未ログインなので Authorization なし）
    const finishUrl = FN("webauthn-login-finish");
    const finishRes = await fetch(finishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assertion,
        expectedChallenge: startJson.challenge,
      }),
    });

    // ※ ここで Edge Function が Supabase セッション cookie を発行する or
    //   access_token を返す実装にして、フロントで supabase.auth.setSession(...) する。
    const result = await finishRes.json();
    if (!finishRes.ok) throw new Error(result?.error || finishRes.statusText);

    // (A) Edge が access_token を返す設計の場合
    if (result?.access_token && result?.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (error) throw error;
    }

    alert("パスキーでログインしました");
    location.href = "main.html";
  } catch (e) {
    alert(`パスキーでのログインに失敗しました：${e.message || e}`);
  }
}
