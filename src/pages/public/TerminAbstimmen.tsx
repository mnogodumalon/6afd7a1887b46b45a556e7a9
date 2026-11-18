import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import { OptionVote } from '@/components/blocks/OptionVote';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { VOTES, fieldText, type JourneyRecord } from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  loadPublicPagesConfig, checkDoorLink, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { tx } from '@/i18n';

const SLUG = 'termin-abstimmen';

type Phase = 'loading' | 'unavailable' | 'invalid' | 'nolink' | 'problem' | 'ready';

export default function TerminAbstimmen() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [umfrage, setUmfrage] = useState<JourneyRecord | null>(null);
  const [attempt, setAttempt] = useState(0);

  const linkedId = useMemo(() => {
    const q = window.location.hash.split('?')[1] ?? '';
    return new URLSearchParams(q).get('umfrage');
  }, []);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  useEffect(() => {
    let alive = true;
    setPhase('loading');
    (async () => {
      try {
        const c = await loadPublicPagesConfig(SLUG);
        const p = c?.pages[SLUG] ?? null;
        if (!alive) return;
        if (!c || !p) { setPhase('unavailable'); return; }
        setCfg(c);
        setPage(p);
        if (!linkedId) { setPhase('nolink'); return; }
        if ((await checkDoorLink(SLUG)) === 'invalid') { if (alive) setPhase('invalid'); return; }
        const rec = await createPublicPort(c, p).get('umfragen', linkedId);
        if (!alive) return;
        if (!rec) { setPhase('invalid'); return; }
        setUmfrage(rec);
        setPhase('ready');
      } catch (e) {
        if (!alive) return;
        setPhase(e instanceof PageUnavailableError ? 'invalid' : 'problem');
      }
    })();
    return () => { alive = false; };
  }, [linkedId, attempt]);

  if (phase === 'loading') return <PublicShell loading />;
  if (phase === 'unavailable') return <PublicShell unavailable />;
  if (phase === 'invalid') {
    return (
      <PublicShell title={tx('Termin abstimmen')}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link ist nicht mehr gültig. Bitte den aktuellen Link oder QR-Code verwenden.')}
        </p>
      </PublicShell>
    );
  }
  if (phase === 'nolink') {
    return (
      <PublicShell title={tx('Termin abstimmen')}>
        <p className="text-sm text-muted-foreground">
          {tx('Bitte öffne den Link oder QR-Code deiner Umfrage, um abzustimmen.')}
        </p>
      </PublicShell>
    );
  }
  if (phase === 'problem' || !umfrage) {
    return (
      <PublicShell title={tx('Termin abstimmen')}>
        <LoadProblem onRetry={() => setAttempt(a => a + 1)} />
      </PublicShell>
    );
  }

  const titel = fieldText(umfrage, 'titel');
  const beschreibung = fieldText(umfrage, 'beschreibung');
  const ort = fieldText(umfrage, 'ort');

  return (
    <PublicShell title={titel || tx('Termin abstimmen')} description={beschreibung || undefined}>
      <div className="space-y-4">
        {ort && <p className="text-sm text-muted-foreground">{tx('Ort')}: {ort}</p>}
        <OptionVote port={port} vote={VOTES['termin-abstimmen']} parentId={linkedId} draftKey="termin-abstimmen" />
      </div>
    </PublicShell>
  );
}
