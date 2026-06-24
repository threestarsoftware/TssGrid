/* TssGrid サイト 共通スクリプト（ノービルド・依存なし） */
(function () {
  'use strict';

  // モバイルナビ開閉
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
    nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') nav.classList.remove('open'); });
  }

  // フッタの年号を自動更新（要素 #year）
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // コードブロックにコピーボタンを付与
  document.querySelectorAll('pre.code').forEach(function (pre) {
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'コピー';
    btn.style.cssText = 'position:absolute;top:8px;right:8px;font-size:11px;padding:4px 9px;border-radius:6px;border:1px solid #2c3a4a;background:#1b2733;color:#cdd9e5;cursor:pointer;opacity:0;transition:opacity .15s';
    var box = document.createElement('div');
    box.style.position = 'relative';
    pre.parentNode.insertBefore(box, pre);
    box.appendChild(pre);
    box.appendChild(btn);
    box.addEventListener('mouseenter', function () { btn.style.opacity = '1'; });
    box.addEventListener('mouseleave', function () { btn.style.opacity = '0'; });
    btn.addEventListener('click', function () {
      var text = pre.innerText.replace(/\nコピー$/, '');
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'コピー済';
        setTimeout(function () { btn.textContent = 'コピー'; }, 1400);
      });
    });
  });
})();
