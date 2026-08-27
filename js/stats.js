/* ============================================================
   stats.js — 전체 응답자 분포

   ▼ 갱신할 때는 아래 DISTRIBUTION 한 곳만 고치면 된다.

   서버를 두지 않는 사이트라 집계값을 실시간으로 읽어올 수 없다.
   GA4에서 주기적으로 확인한 수치를 손으로 옮겨 적는다.

   갱신 방법
     1. GA4 → 탐색 → 자유 형식
     2. 행: 기질 그룹(맞춤 측정기준 group) / 값: 이벤트 수
        필터: 이벤트 이름 = test_complete
     3. 네 그룹의 숫자를 counts에 옮긴다
     4. updated를 확인한 날짜로 바꾼다

   표본이 MIN_SAMPLE에 못 미치면 화면에 아예 띄우지 않는다.
   응답이 몇 건일 때 "전체의 100%가 NT"를 보여주면 신뢰도만 깎인다.
   ============================================================ */
window.QuizStats = (function () {
  'use strict';

  var DISTRIBUTION = {
    updated: '',                                  // 예: '2026-09-30'
    counts:  { NT: 0, NF: 0, SJ: 0, SP: 0 }
  };

  var MIN_SAMPLE = 100;

  function total(order) {
    return order.reduce(function (n, k) { return n + (DISTRIBUTION.counts[k] || 0); }, 0);
  }

  /* 반올림한 퍼센트의 합이 99%나 101%가 되면 눈에 띈다.
     가장 큰 그룹에 오차를 몰아 합계를 정확히 100%로 맞춘다. */
  function percents(order, sum) {
    var pct = {}, acc = 0, top = order[0];
    order.forEach(function (k) {
      pct[k] = Math.round((DISTRIBUTION.counts[k] || 0) / sum * 100);
      acc += pct[k];
      if (DISTRIBUTION.counts[k] > DISTRIBUTION.counts[top]) { top = k; }
    });
    pct[top] += 100 - acc;
    return pct;
  }

  function rankLabel(order, pct, mine) {
    var sorted = order.slice().sort(function (a, b) { return pct[b] - pct[a]; });
    return ['가장 많은 유형', '두 번째로 많은 유형',
            '세 번째로 많은 유형', '가장 적은 유형'][sorted.indexOf(mine)];
  }

  return {
    /* mine: 판정된 그룹 / order: ['NT','NF','SJ','SP'] / groups: 별칭 테이블 */
    render: function (mine, order, groups) {
      var box  = document.getElementById('dist');
      var line = document.getElementById('share-of');
      if (!box || !line) { return; }

      var sum = total(order);
      if (sum < MIN_SAMPLE) { box.hidden = true; line.hidden = true; return; }

      var pct = percents(order, sum);
      var n   = sum.toLocaleString('ko-KR');

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
      document.getElementById('dist-note').textContent =
        DISTRIBUTION.updated + ' 기준 · 진단 ' + n + '건';
      box.hidden = false;
    }
  };
})();
