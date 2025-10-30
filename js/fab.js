// js/fab.js : 右下メニュー（設定 / お知らせ）
(function(){
  if (document.getElementById("global-fab")) return;

  const wrap = document.createElement("div");
  wrap.id = "global-fab";
  wrap.className = "fab-wrap";
  wrap.innerHTML = `
    <div class="fab-panel" aria-hidden="true">
      <a href="settings.html" title="設定"><span class="fab-ico">⚙️</span><span>設定</span></a>
      <a href="announcements.html" title="お知らせ"><span class="fab-ico">📰</span><span>お知らせ</span></a>
    </div>
    <button class="fab-main" aria-label="メニューを開閉">≡</button>
  `;
  document.body.appendChild(wrap);

  const btn = wrap.querySelector(".fab-main");
  btn.addEventListener("click", ()=> wrap.classList.toggle("open"));
  document.addEventListener("click", e=>{
    if (!wrap.contains(e.target)) wrap.classList.remove("open");
  });
})();
