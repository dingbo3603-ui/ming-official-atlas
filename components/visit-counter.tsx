'use client';

import { useEffect, useState } from 'react';
import './visit-counter.css';

type VisitTotals = {total:number; today:number; since:string};
let request: Promise<VisitTotals> | undefined;

function readVisits() {
  if (request) return request;
  const live = ['dmwc.cc', 'www.dmwc.cc'].includes(window.location.hostname);
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  const requestId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  request = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 4500);
      try {
        const response = await fetch('/api/visits.php', {
          method: live ? 'POST' : 'GET', signal: controller.signal, cache: 'no-store',
          headers: live ? {'Content-Type':'application/json'} : undefined,
          body: live ? JSON.stringify({request_id:requestId,path:window.location.pathname.slice(0,180),referrer:document.referrer ? new URL(document.referrer).origin : ''}) : undefined,
        });
        if (!response.ok) throw new Error('Counter unavailable');
        const result = await response.json() as VisitTotals;
        if (!Number.isSafeInteger(result.total) || result.total < 0 || !Number.isSafeInteger(result.today)
          || result.today < 0 || result.today > result.total || !/^\d{4}-\d{2}-\d{2}$/.test(result.since)) throw new Error('Invalid counter');
        return result;
      } catch (error) {
        if (attempt === 1) throw error;
      } finally { window.clearTimeout(timer); }
    }
    throw new Error('Counter unavailable');
  })();
  return request;
}

export function VisitCounter() {
  const [totals, setTotals] = useState<VisitTotals | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const read = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', read);
      void readVisits().then(value => {if (active) setTotals(value);})
        .catch(() => {if (active) setFailed(true);});
    };
    if (document.visibilityState === 'visible') read();
    else document.addEventListener('visibilitychange', read);
    return () => {active=false; document.removeEventListener('visibilitychange', read);};
  }, []);
  const format = (value:number) => value.toLocaleString('zh-CN');
  return <footer className="atlas-visit-footer" aria-label="网站访问统计"
    title={totals ? `自 ${totals.since} 起统计；每次打开网页计一次，站内切换不重复计数。` : undefined}>
    {totals ? <><span>累计访问 <b>{format(totals.total)}</b> 次</span><span className="visit-separator" aria-hidden>·</span><span>今日访问 <b>{format(totals.today)}</b> 次</span></>
      : <span>{failed ? '访问统计暂不可用' : '访问统计读取中'}</span>}
  </footer>;
}
