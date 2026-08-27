/* ============================================================
   /api/count — 진단 결과 집계 (Vercel 서버리스 함수)

   진단이 끝나면 프런트가 이 엔드포인트를 한 번 호출한다.
   그룹 카운터를 1 올리고, 올린 뒤의 네 그룹 합계를 그대로 돌려준다.
   호출 한 번으로 기록과 조회를 함께 끝내 왕복을 줄인다.

   저장소는 Redis REST API를 쓴다. npm 의존성 없이 fetch만 사용하므로
   이 저장소에는 package.json도 node_modules도 없다.

   ▼ 필요한 환경변수 (Vercel 프로젝트 설정에 등록)
     KV_REST_API_URL   또는  UPSTASH_REDIS_REST_URL
     KV_REST_API_TOKEN 또는  UPSTASH_REDIS_REST_TOKEN

   Vercel 마켓플레이스에서 Redis 저장소를 만들어 프로젝트에 연결하면
   위 이름 중 하나로 자동 주입된다. 어느 쪽이 들어오든 동작하도록
   두 이름을 모두 받는다. 토큰은 절대 저장소에 커밋하지 않는다.
   ============================================================ */

const GROUPS = ['NT', 'NF', 'SJ', 'SP'];
const KEY = 'mbti:counts';

const URL_ENV   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/* Redis REST는 명령을 배열로 받는다. 예: ["HINCRBY","mbti:counts","SJ","1"] */
async function redis(command) {
  const res = await fetch(URL_ENV, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN_ENV}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) { throw new Error(`redis ${res.status}`); }
  const json = await res.json();
  return json.result;
}

/* 같은 IP가 짧은 시간에 반복 호출해 수치를 부풀리는 것을 막는다.
   완벽한 차단이 목적이 아니라 장난 수준을 걸러내는 정도다.
   한도를 넘겨도 에러를 내지 않고 집계만 건너뛴 채 현재 수치를 돌려준다. */
const RATE_LIMIT = 5;      // 창 안에서 허용할 집계 횟수
const RATE_WINDOW = 3600;  // 초

async function withinRate(ip) {
  const key = `mbti:rate:${ip}`;
  const hits = await redis(['INCR', key]);
  if (hits === 1) { await redis(['EXPIRE', key, String(RATE_WINDOW)]); }
  return hits <= RATE_LIMIT;
}

async function readCounts() {
  const flat = await redis(['HGETALL', KEY]) || [];
  const counts = {};
  GROUPS.forEach(g => { counts[g] = 0; });
  // HGETALL은 [필드, 값, 필드, 값, ...] 형태로 온다
  for (let i = 0; i < flat.length; i += 2) {
    if (GROUPS.includes(flat[i])) { counts[flat[i]] = Number(flat[i + 1]) || 0; }
  }
  return counts;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST만 허용한다' });
  }
  if (!URL_ENV || !TOKEN_ENV) {
    // 저장소를 아직 연결하지 않은 상태. 프런트는 분포를 숨기고 넘어간다.
    return res.status(503).json({ error: '저장소가 설정되지 않았다' });
  }

  const group = req.body && req.body.group;
  if (!GROUPS.includes(group)) {
    return res.status(400).json({ error: '알 수 없는 그룹' });
  }

  try {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (await withinRate(ip)) { await redis(['HINCRBY', KEY, group, '1']); }

    const counts = await readCounts();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ counts });
  } catch (err) {
    // 집계 실패가 진단 결과를 막아서는 안 된다
    return res.status(502).json({ error: '집계 실패' });
  }
}
