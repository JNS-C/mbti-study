/* ============================================================
   test.js — 공부 습관 자가진단 채점
   채점은 브라우저에서만 이뤄지고 답변 내용은 저장·전송하지 않는다.
   판정된 그룹만 GA4 이벤트로 익명 집계한다.
   보내는 이벤트는 두 개다 — test_start(첫 응답), test_complete(채점 완료).
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

  /* --- GA4 이벤트 ------------------------------------------- */
  /* gtag는 각 페이지 head의 인라인 스니펫이 정의한다. 광고 차단기가
     스니펫까지 막으면 존재하지 않으므로, 없으면 조용히 넘어간다.
     추적이 실패해도 채점은 영향받지 않아야 한다. */
  function track(name, params) {
    if (typeof gtag !== 'function') { return; }
    try { gtag('event', name, params); } catch (err) { /* 무시한다 */ }
  }

  /* 첫 문항에 답하는 순간 한 번만 보낸다. 페이지 방문은 page_view가 이미 잡으므로
     이 이벤트는 "실제로 시작했다"를 뜻한다. test_complete와 짝지어 완료율을 낸다.
     다시 하기를 누르면 새 시도이므로 플래그를 풀어 다시 집계되게 한다 —
     그래야 완료 수가 시작 수를 넘어 완료율이 100%를 넘는 일이 없다. */
  var started = false;

  function sendStart() {
    if (started) { return; }
    started = true;
    track('test_start');
  }

  function sendComplete(top, scores) {
    track('test_complete', {
      group: top,                       // NT / NF / SJ / SP
      group_alias: GROUPS[top].alias,   // 분석가 / 이상주의자 / 관리자 / 탐험가
      score: scores[top]                // 최고 득점 (0~10)
    });
  }

  /* --- 스텝 진행 --------------------------------------------- */
  /* 문항을 하나씩 보여준다. JS가 여기까지 왔을 때만 quiz--step을 붙이므로
     JS가 없거나 실패하면 10문항이 전부 보이는 기존 동작이 그대로 남는다. */
  var fields  = Array.prototype.slice.call(form.querySelectorAll('.q'));
  var stepper = document.getElementById('stepper');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var pText   = document.getElementById('progress-text');
  var pFill   = document.getElementById('progress-fill');
  var submitRow = document.getElementById('submit-row');

  var step = 0;
  var advanceTimer = null;

  /* 라디오 그룹은 방향키로 이동할 때마다 선택이 바뀌며 change가 발생한다.
     그대로 자동 넘김을 걸면 키보드 사용자는 보기를 둘러볼 수조차 없다.
     click 이벤트도 방향키에서 함께 발생하므로 이벤트 종류로는 구분되지 않는다.
     그래서 입력 방식을 직접 추적한다. */
  var byKeyboard = false;

  function answered(i) {
    return !!fields[i].querySelector('input:checked');
  }

  function syncControls() {
    var last = step === fields.length - 1;
    prevBtn.disabled = step === 0;
    nextBtn.disabled = !answered(step);
    nextBtn.hidden   = last;
    submitRow.hidden = !last;
    pText.textContent = (step + 1) + ' / ' + fields.length;
    pFill.style.width = ((step + 1) / fields.length * 100) + '%';
  }

  function goTo(i, focus) {
    if (i < 0 || i >= fields.length) { return; }
    clearTimeout(advanceTimer);
    step = i;
    fields.forEach(function (f, n) { f.hidden = n !== i; });
    syncControls();
    if (focus !== false) {
      fields[i].querySelector('legend').focus({ preventScroll: true });
      form.scrollIntoView({ block: 'start' });
    }
  }

  form.addEventListener('pointerdown', function () { byKeyboard = false; });

  form.addEventListener('keydown', function (e) {
    if (/^Arrow/.test(e.key)) { byKeyboard = true; }
  });

  form.addEventListener('change', function (e) {
    if (e.target.type !== 'radio') { return; }
    sendStart();
    notice.textContent = '';
    syncControls();
    if (byKeyboard || step === fields.length - 1) { return; }
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(function () { goTo(step + 1); }, 300);
  });

  prevBtn.addEventListener('click', function () { goTo(step - 1); });
  nextBtn.addEventListener('click', function () { goTo(step + 1); });

  stepper.hidden = false;
  form.classList.add('quiz--step');
  goTo(0, false);

  /* --- 제출 ------------------------------------------------- */
  var current = null;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(advanceTimer);
    var r = score();

    if (r.missing) {
      result.hidden = true;
      notice.textContent = '아직 답하지 않은 문항이 있다. 표시된 문항을 확인한다.';
      // 숨겨진 문항에 표시해봐야 보이지 않으므로 해당 단계로 데려간다
      goTo(fields.indexOf(r.missing));
      return;
    }

    notice.textContent = '';
    var top = winner(r.scores);
    current = { code: top, group: render(r.scores, top) };
    sendComplete(top, r.scores);
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
    current = null;
    started = false;   // 다시 하기는 새 시도로 집계한다
    goTo(0);
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
