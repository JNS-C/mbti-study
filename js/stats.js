/* ============================================================
   stats.js — 전체 응답자 분포

   진단이 끝나면 /api/count에 판정된 그룹을 보낸다. 서버가 카운터를 올리고
   올린 뒤의 네 그룹 합계를 그대로 돌려주므로, 왕복 한 번으로 기록과 조회가
   함께 끝나고 방금 낸 내 결과까지 합계에 포함된다.

   집계가 실패해도 진단 결과는 그대로 보여야 한다. 네트워크 오류, 저장소
   미설정(503), 광고 차단기 어느 쪽이든 분포 영역만 조용히 숨긴다.

   표본이 MIN_SAMPLE에 못 미치면 띄우지 않는다.
   응답이 몇 건일 때 "전체의 100%가 NT"를 보여주면 신뢰도만 깎인다.
   ============================================================ */
window.QuizStats = (function () {
  'use strict';

  var MIN_SAMPLE = 100;
  var ENDPOINT   = '/api/count';
  var TIMEOUT_MS = 4000;

  function hide() {
    var box  = document.getElementById('dist');
    var line = document.getElementById('share-of');
    if (box)  { box.hidden = true; }
    if (line) { line.hidden = true; }
  }

  /* 반올림한 퍼센트의 합이 99%나 101%가 되면 눈에 띈다.
     가장 큰 그룹에 오차를 몰아 합계를 정확히 100%로 맞춘다. */
  function percents(counts, order, sum) {
    var pct = {}, acc = 0, top = order[0];
    order.forEach(function (k) {
      pct[k] = Math.round((counts[k] || 0) / sum * 100);
      acc += pct[k];
      if ((counts[k] || 0) > (counts[top] || 0)) { top = k; }
    });
    pct[top] += 100 - acc;
    return pct;
  }

  function rankLabel(order, pct, mine) {
    var sorted = order.slice().sort(function (a, b) { return pct[b] - pct[a]; });
    return ['가장 많은 유형', '두 번째로 많은 유형',
            '세 번째로 많은 유형', '가장 적은 유형'][sorted.indexOf(mine)];
  }

  function paint(counts, mine, order, groups) {
    var sum = order.reduce(function (n, k) { return n + (counts[k] || 0); }, 0);
    if (sum < MIN_SAMPLE) { hide(); return; }

    var pct = percents(counts, order, sum);
    var n   = sum.toLocaleString('ko-KR');

    var line = document.getElementById('share-of');
    line.textContent = '지금까지 진단한 ' + n + '명 중 ' + pct[mine] + '%가 같은 유형이다.';
    line.hidden = false;

    order.forEach(function (k) {
      document.getElementById('d-' + k).textContent = pct[k] + '%';
      document.getElementById('df-' + k).style.width = pct[k] + '%';
      // 내 유형 막대만 도드라지게 한다
      document.querySelector('#dist-bars [data-group="' + k + '"]')
        .classList.toggle('bar--mine', k === mine);
    });

    document.getElementById('dist-head').textContent =
      groups[mine].alias + '는 네 유형 중 ' + rankLabel(order, pct, mine) + '이다';
    document.getElementById('dist-note').textContent = '실시간 집계 · 진단 ' + n + '건';
    document.getElementById('dist').hidden = false;
  }

  return {
    /* mine: 판정된 그룹 / order: ['NT','NF','SJ','SP'] / groups: 별칭 테이블 */
    render: function (mine, order, groups) {
      if (!document.getElementById('dist')) { return; }
      hide();

      // 응답이 늦으면 결과 화면만 붙잡고 있을 이유가 없다
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) { ctrl.abort(); } }, TIMEOUT_MS);

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: mine }),
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (data && data.counts) { paint(data.counts, mine, order, groups); }
        })
        .catch(function () { /* 집계 실패는 결과 표시를 막지 않는다 */ })
        .then(function () { clearTimeout(timer); });
    }
  };
})();
