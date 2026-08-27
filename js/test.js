/* ============================================================
   test.js — 공부 습관 자가진단 채점
   서버·API 없이 브라우저에서만 계산한다. 저장도 하지 않는다.
   alert / confirm 은 쓰지 않고 인라인 텍스트로 안내한다.
   ============================================================ */
(function () {
  'use strict';

  var TOTAL = 10;
  var ORDER = ['NT', 'NF', 'SJ', 'SP'];  // 동점 시 이 순서로 타이브레이크

  var GROUPS = {
    NT: { alias: '분석가',     page: 'nt.html', desc: '원리를 이해해야 비로소 외워지는 사람. 구조를 먼저 잡으면 암기해야 할 양 자체가 줄어든다.' },
    NF: { alias: '이상주의자', page: 'nf.html', desc: '의미가 붙어야 머리에 남는 사람. 왜 배우는지가 정해지면 그때부터 속도가 붙는다.' },
    SJ: { alias: '관리자',     page: 'sj.html', desc: '계획과 반복으로 쌓아 올리는 사람. 매일 같은 자리에서 만든 총량이 결국 앞선다.' },
    SP: { alias: '탐험가',     page: 'sp.html', desc: '몸으로 부딪쳐야 감이 오는 사람. 시동만 걸리면 가장 빠르게 달린다.' }
  };

  var form   = document.getElementById('quiz');
  var result = document.getElementById('result');
  var notice = document.getElementById('notice');
  if (!form || !result) { return; }

  /* --- 채점 ------------------------------------------------- */
  function score() {
    var s = { NT: 0, NF: 0, SJ: 0, SP: 0 };
    var missing = null;

    for (var i = 1; i <= TOTAL; i++) {
      var picked = form.querySelector('input[name="q' + i + '"]:checked');
      var field  = form.querySelector('input[name="q' + i + '"]').closest('.q');
      if (picked) {
        field.classList.remove('is-missing');
        s[picked.value]++;
      } else {
        field.classList.add('is-missing');
        if (!missing) { missing = field; }
      }
    }
    return { scores: s, missing: missing };
  }

  function winner(s) {
    return ORDER.reduce(function (best, key) {
      return s[key] > s[best] ? key : best;   // 동점이면 ORDER 앞쪽이 남는다
    }, ORDER[0]);
  }

  /* --- 결과 렌더 -------------------------------------------- */
  function render(s, top) {
    var g = GROUPS[top];

    result.style.setProperty('--group', 'var(--' + top.toLowerCase() + ')');
    document.getElementById('r-code').textContent  = top;
    document.getElementById('r-alias').textContent = g.alias;
    document.getElementById('r-desc').textContent  = g.desc;

    var link = document.getElementById('r-link');
    link.setAttribute('href', g.page);
    link.textContent = top + ' 공부법 보러 가기';

    ORDER.forEach(function (key) {
      document.getElementById('s-' + key).textContent = s[key] + ' / ' + TOTAL;
      document.getElementById('f-' + key).style.width = (s[key] / TOTAL * 100) + '%';
    });

    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return g;
  }

  /* --- 제출 ------------------------------------------------- */
  var current = null;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var r = score();

    if (r.missing) {
      result.hidden = true;
      notice.textContent = '아직 답하지 않은 문항이 있다. 표시된 문항을 확인한다.';
      r.missing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    notice.textContent = '';
    var top = winner(r.scores);
    current = { code: top, group: render(r.scores, top) };
  });

  /* --- 다시 하기 -------------------------------------------- */
  document.getElementById('retry').addEventListener('click', function () {
    form.reset();
    result.hidden = true;
    notice.textContent = '';
    document.getElementById('share-msg').textContent = '';
    document.getElementById('share-url').hidden = true;
    Array.prototype.forEach.call(form.querySelectorAll('.q'), function (q) {
      q.classList.remove('is-missing');
    });
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* --- 공유 ------------------------------------------------- */
  document.getElementById('share').addEventListener('click', function () {
    if (!current) { return; }

    var msg  = document.getElementById('share-msg');
    var box  = document.getElementById('share-url');
    var url  = location.href.split('#')[0];
    var text = '내 공부 유형은 ' + current.code + ' ' + current.group.alias +
               '! 너는 어떤 엔진인지 확인해봐 — MBTI 공부법 연구소';

    function fallback() {
      box.value = text + ' ' + url;
      box.hidden = false;
      box.select();
      msg.textContent = '아래 문구를 복사해 친구에게 보낸다.';
    }

    if (navigator.share) {
      navigator.share({ title: 'MBTI 공부법 연구소', text: text, url: url })
        .then(function () { msg.textContent = '공유 창을 열었다.'; })
        .catch(function (err) {
          // 사용자가 공유 창을 닫은 것은 실패가 아니다
          if (err && err.name === 'AbortError') { msg.textContent = ''; return; }
          fallback();
        });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + ' ' + url)
        .then(function () { msg.textContent = '공유 문구를 클립보드에 복사했다.'; })
        .catch(fallback);
    } else {
      fallback();
    }
  });
})();
