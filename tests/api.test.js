const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

async function fixture(t, options = {}) {
  let used = 0;
  const pending = new Set();
  const stats = { calls: 0 };
  const supabase = {
    auth: { async getUser(token) { return { data: { user: token === 'valid' ? { id: 'user-1' } : null } }; } },
    from() { return { select() { return this; }, eq() { return this; }, async single() { return { data: { plan: 'free', questions_used: used, question_limit: 1, subscription_status: 'free' } }; } }; },
    async rpc(name, args) {
      if (options.databaseError) return { error: true };
      if (name === 'reserve_question') {
        if (used >= 1) return { data: [] };
        used++; pending.add('r1');
        return { data: [{ reservation_id: 'r1', questions_used: used, question_limit: 1 }] };
      }
      if (pending.delete(args.reservation_id) && args.refund) used--;
      return {};
    }
  };
  const openai = { responses: { async create() {
    stats.calls++;
    if (options.fail) throw Error('sensitive-provider-detail');
    return { output_text: options.output ?? JSON.stringify({ answer: 'A', answerText: '200', explanation: 'Success.' }) };
  } } };
  const app = createApp({ supabase, openai, origins: ['https://allowed.example'], rateLimit: options.rateLimit ?? 60 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { stats, used: () => used, request: (path, opts = {}) => fetch(base + path, opts), answer: (body = {question: 'HTTP success?', choices: ['200','404']}, token = 'valid') => fetch(base+'/answer', {method:'POST', headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}, body:JSON.stringify(body)}) };
}

test('health and authenticated profile contract', async t => {
  const f=await fixture(t);
  assert.equal((await f.request('/health')).status,200);
  assert.equal((await f.request('/profile')).status,401);
  const response=await f.request('/profile',{headers:{authorization:'Bearer valid'}});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).questionLimit,1);
});
test('invalid credentials never call provider', async t => {
  const f=await fixture(t); assert.equal((await f.answer(undefined,'invalid')).status,401);assert.equal(f.stats.calls,0);
});
for(const body of [{question:' '},{question:5},{question:'x',choices:'bad'},{question:'x',choices:[{}]},{question:'x'.repeat(10001)}]) {
  test(`validates input ${JSON.stringify(body).slice(0,60)}`,async t=>{const f=await fixture(t);assert.equal((await f.answer(body)).status,400);assert.equal(f.stats.calls,0)});
}
test('concurrent requests enforce adapter reservation contract',async t=>{
  const f=await fixture(t);const results=await Promise.all([f.answer(),f.answer()]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);assert.equal(f.stats.calls,1);assert.equal(f.used(),1);
  const ok=await results.find(r=>r.status===200).json();assert.equal(ok.answer,'A');assert.equal(ok.questionsUsed,1);
});
for(const options of [{fail:true},{output:'not-json'},{output:'{}'},{output:'{"answer":"Z","answerText":"x","explanation":"x"}'}]) {
  test(`provider failure refunds reservation ${JSON.stringify(options)}`,async t=>{
    const f=await fixture(t,options);const res=await f.answer();assert.equal(res.status,502);assert.equal(f.used(),0);assert.ok(!(await res.text()).includes('sensitive-provider-detail'));
  });
}
test('database fails closed',async t=>{const f=await fixture(t,{databaseError:true});assert.equal((await f.answer()).status,503);assert.equal(f.stats.calls,0)});
test('CORS allowlist',async t=>{const f=await fixture(t);for(const origin of ['https://allowed.example','https://untrusted.example']){const res=await f.request('/profile',{headers:{origin}});assert.equal(res.headers.get('access-control-allow-origin'),origin.includes('untrusted')?null:origin)}});
test('rate limit',async t=>{const f=await fixture(t,{rateLimit:1});await f.request('/profile');const res=await f.request('/profile');assert.equal(res.status,429);assert.ok(res.headers.get('retry-after'))});
test('malformed and oversized JSON',async t=>{const f=await fixture(t);for(const [body,status] of [['{',400],[JSON.stringify({question:'x'.repeat(40000)}),413]]){const res=await f.request('/answer',{method:'POST',headers:{'content-type':'application/json'},body});assert.equal(res.status,status)}});
