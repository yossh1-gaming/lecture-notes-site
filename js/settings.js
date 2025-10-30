import { supabase } from "./supabase.js";
const $ = id => document.getElementById(id);

const gate = $("gate"), content = $("content");
const curEmail = $("cur-email"), emailStatus = $("email-status");
const nickInput = $("nick"), saveNickBtn = $("save-nick");
const newEmail = $("new-email"), changeEmailBtn = $("change-email"), resendVerifyBtn = $("resend-verify");
const newPass = $("new-pass"), newPass2 = $("new-pass2"), changePassBtn = $("change-pass");
const nickMsg = $("nick-msg"), emailMsg = $("email-msg"), passMsg = $("pass-msg");
const delInput = $("delete-confirm"), delBtn = $("delete-account"), delMsg = $("delete-msg");

let me = null, profile = null;
const info = (el, msg, cls="") => { el.className=`small ${cls}`; el.textContent=msg; };
const showGate = ()=>{ gate.style.display="block"; content.style.display="none"; };
const showMain = ()=>{ gate.style.display="none"; content.style.display="block"; };

async function loadUser(){
  const {data:{user}}=await supabase.auth.getUser();
  me=user||null;
  if(!me)return;
  const {data}=await supabase.from("profiles").select("username").eq("id",me.id).single();
  profile=data;
}

function render(){
  if(!me)return showGate();
  showMain();
  curEmail.textContent=me.email||"–";
  emailStatus.innerHTML = me.email_confirmed_at ? "<span class='ok'>認証済み</span>" : "<span class='warn'>未認証</span>";
  nickInput.value=profile?.username||"";
}

// ニックネーム変更
async function saveNick(){
  const name=(nickInput.value||"").trim();
  if(!name)return info(nickMsg,"ニックネームを入力してください。","err");
  const {error}=await supabase.from("profiles").update({username:name}).eq("id",me.id);
  if(error)return info(nickMsg,error.message,"err");
  info(nickMsg,"保存しました。","ok");
}

// メール変更
async function changeEmail(){
  const email=(newEmail.value||"").trim();
  if(!email)return info(emailMsg,"新しいメールを入力","err");
  const redirectTo=`${location.origin}/confirm.html`;
  const {error}=await supabase.auth.updateUser({email,emailRedirectTo:redirectTo});
  if(error)return info(emailMsg,error.message,"err");
  info(emailMsg,"確認メールを送信しました。","ok");
}

// 認証再送
async function resendVerify(){
  const redirectTo = `${location.origin}/confirm.html`;
  await supabase.auth.resend({
    type: "signup",
    email: me.email,
    options: { emailRedirectTo: redirectTo }
  });
  if(error)return info(emailMsg,error.message,"err");
  info(emailMsg,"認証メールを再送しました。","ok");
}

// パスワード変更
async function changePass(){
  const p1=newPass.value,p2=newPass2.value;
  if(p1.length<6)return info(passMsg,"6文字以上必要です","err");
  if(p1!==p2)return info(passMsg,"一致しません","err");
  const {error}=await supabase.auth.updateUser({password:p1});
  if(error)return info(passMsg,error.message,"err");
  info(passMsg,"変更しました","ok");
  newPass.value="";newPass2.value="";
}

// アカウント削除
async function deleteAccount(){
  if ((delInput.value || "").trim() !== "削除") {
    info(delMsg, "「削除」と入力してください", "err");
    return;
  }
  if (!confirm("本当に削除しますか？この操作は取り消せません。")) return;

  const { error } = await supabase.rpc("delete_my_account_keep_notes");
  if (error) { info(delMsg, "削除に失敗: " + error.message, "err"); return; }

  await supabase.auth.signOut();
  info(delMsg, "削除しました。トップへ移動します", "ok");
  setTimeout(() => location.replace("index.html"), 700);
}


// 参照（先頭のほうの定義群に追加）
const logoutBtn = document.getElementById("logout-btn");
const logoutMsg = document.getElementById("logout-msg");

// ログアウト処理
async function onLogout(){
  try{
    await supabase.auth.signOut();
    logoutMsg.textContent = "ログアウトしました。トップに移動します…";
    logoutMsg.className = "small ok";
  }catch(e){
    logoutMsg.textContent = "ログアウトに失敗しました：" + (e?.message || e);
    logoutMsg.className = "small err";
    return;
  }
  setTimeout(()=> location.replace("index.html"), 600);
}

function bind(){
  saveNickBtn.onclick=saveNick;
  changeEmailBtn.onclick=changeEmail;
  resendVerifyBtn.onclick=resendVerify;
  changePassBtn.onclick=changePass;
  delBtn.onclick=deleteAccount;
  if (logoutBtn) logoutBtn.onclick = onLogout;  
}

async function boot(){ await loadUser(); render(); bind(); }
if(document.readyState==="loading")window.addEventListener("DOMContentLoaded",boot);else boot();
