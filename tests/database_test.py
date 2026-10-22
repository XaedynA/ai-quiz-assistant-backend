"""Real PostgreSQL concurrency and permission regression checks; disposable DB only."""
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import psycopg

url = os.environ['TEST_DATABASE_URL']
uid = '00000000-0000-0000-0000-000000000001'
with psycopg.connect(url, autocommit=True) as db:
    db.execute('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
    db.execute('CREATE TABLE public.profiles(id uuid PRIMARY KEY, questions_used integer NOT NULL DEFAULT 0, question_limit integer NOT NULL DEFAULT 1)')
    db.execute(Path('migrations/001_atomic_usage.sql').read_text())
    db.execute('INSERT INTO public.profiles(id) VALUES(%s)', (uid,))

def reserve(_):
    with psycopg.connect(url) as db:
        db.execute('SET ROLE service_role')
        return db.execute('SELECT * FROM public.reserve_question(%s)', (uid,)).fetchall()

with ThreadPoolExecutor(max_workers=12) as pool:
    results = list(pool.map(reserve, range(12)))
rows = [row for result in results for row in result]
assert len(rows) == 1, rows
rid = rows[0][0]
with psycopg.connect(url, autocommit=True) as db:
    assert db.execute('SELECT questions_used FROM profiles').fetchone()[0] == 1
    for _ in range(2):
        db.execute('SELECT public.finish_question(%s,true)', (rid,))
    assert db.execute('SELECT questions_used FROM profiles').fetchone()[0] == 0
    rid = db.execute('SELECT * FROM public.reserve_question(%s)', (uid,)).fetchone()[0]
    db.execute('SELECT public.finish_question(%s,false)', (rid,))
    db.execute('SELECT public.finish_question(%s,true)', (rid,))
    assert db.execute('SELECT questions_used FROM profiles').fetchone()[0] == 1
    db.execute('SET ROLE authenticated')
    for sql in ['SELECT * FROM public.reserve_question(%s)', 'UPDATE public.profiles SET questions_used=0 WHERE id=%s']:
        try:
            db.execute(sql, (uid,))
        except psycopg.errors.InsufficientPrivilege:
            pass
        else:
            raise AssertionError('Client unexpectedly allowed to mutate quota')
print('PostgreSQL concurrent reservation, idempotent refund, and permission checks passed.')
