import { supabase } from "./supabase.js";
import { getCurrentUserProfile, signOut } from "./auth.js";

let noteId, currentUserProfile;

async function init(){
  const params=new URLSearchParams(location.search);
  noteId=params.get("note_id");
  currentUserProfile=await getCurrentUserProfile();

  document.getElementById("comment-btn").onclick=postComment;
  if(!noteId) return alert("note_id がありません");

  loadComments();
}

async function postComment(){
  const inp=document.getElementById("comment-input");
  const c=inp.value.trim();
  if(!c) return;
  await supabase.from("comments").insert({ note_id:noteId,user_id:(await supabase.auth.getUser()).data.user.id,content:c});
  inp.value="";
  loadComments();
}

async function loadComments(){
  const { data:comments } = await supabase
    .from("comments")
    .select("content,created_at,profiles!comments_user_id_fkey(username)")
    .eq("note_id",noteId)
    .order("created_at",{ascending:true});
  const ul=document.getElementById("comments-list");
  ul.innerHTML="";
  comments.forEach(c=>{
    const li=document.createElement("li");
    const user=c.profiles.username;
    li.textContent=`${user}: ${c.content} — ${new Date(c.created_at).toLocaleString()}`;
    ul.appendChild(li);
  });
}

window.addEventListener("DOMContentLoaded",init);
