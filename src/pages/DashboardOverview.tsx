import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IconPlus, IconChecklist, IconHourglass, IconTrophy, IconMapPin, IconUsers } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor, decided, countOf } from '@/config/plan';
import type { EnrichedUmfragen } from '@/types/enriched';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { useClock, gruss, namen } from '@/lib/polish';
import { submissionsOf, topOne } from '@/lib/journey';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { RecordDoorLink } from '@/components/widgets/RecordDoorLink';
import { Button } from '@/components/ui/button';

type Filter = 'all' | 'open' | 'undecided';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { terminvorschlaege, antworten } = data;
  const crud = useEntityCrud(data);
  const enrichedUmfragen = crud.enriched.umfragen;
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>('all');

  const cards = useMemo(() => {
    return enrichedUmfragen.map(u => {
      const termine = terminvorschlaege
        .filter(t => extractRecordId(t.fields.umfrage) === u.record_id)
        .sort((a, b) => (a.fields.beginn ?? '').localeCompare(b.fields.beginn ?? ''));
      const own = antworten.filter(a => extractRecordId(a.fields.umfrage) === u.record_id);
      const counts = termine.map(t => {
        const mine = own.filter(a => extractRecordId(a.fields.terminvorschlag) === t.record_id);
        return {
          termin: t,
          ja: mine.filter(a => lookupKey(a.fields.antwort) === 'ja').length,
          vielleicht: mine.filter(a => lookupKey(a.fields.antwort) === 'vielleicht').length,
        };
      });
      const top = topOne(counts, [c => c.ja, c => c.vielleicht], c => c.termin.fields.beginn);
      const people = submissionsOf(own, { names: ['teilnehmer_vorname', 'teilnehmer_nachname'] }).length;
      const closed = lookupKey(u.fields.status) === 'geschlossen';
      const hasFinal = decided('umfragen', 'finaler_termin', u.fields);
      return { u, counts, top, people, closed, hasFinal };
    }).sort((a, b) => Number(a.closed) - Number(b.closed) || b.u.createdat.localeCompare(a.u.createdat));
  }, [enrichedUmfragen, terminvorschlaege, antworten]);

  const openCards = cards.filter(c => !c.closed);
  const undecided = cards.filter(c => !c.hasFinal);
  const shown = filter === 'open' ? openCards : filter === 'undecided' ? undecided : cards;

  const fmt = (iso?: string) => iso ? format(parseISO(iso), 'EEE dd.MM. HH:mm', { locale: dateFnsLocale() }) : '—';
  const fmtEnd = (iso?: string) => iso ? format(parseISO(iso), 'HH:mm', { locale: dateFnsLocale() }) : '';

  const waiting = undecided.filter(c => !c.closed).map(c => c.u.fields.titel ?? '');
  const context = cards.length === 0
    ? tx('Lege deine erste Terminumfrage an und teile den Link.')
    : waiting.length > 0
      ? tx`Auf eine Entscheidung warten: ${namen(waiting)}.`
      : tx('Alle offenen Umfragen haben einen finalen Termin.');

  const shareUmfrage = (u: EnrichedUmfragen) => u;
  void shareUmfrage;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.umfragen.canWrite && (
          <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>
            <IconPlus size={16} className="shrink-0" />
            <span className="ml-1">{tx('Neue Umfrage')}</span>
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="wide"
        kpis={cards.length > 0 ? (
          <StatStrip>
            <StatStripItem
              title={tx('Offen')}
              value={openCards.length}
              icon={<IconHourglass size={16} />}
              onClick={() => setFilter(f => f === 'open' ? 'all' : 'open')}
              active={filter === 'open'}
            />
            <StatStripItem
              title={tx('Ohne finalen Termin')}
              value={undecided.length}
              icon={<IconChecklist size={16} />}
              tone={undecided.length > 0 ? 'warning' : 'default'}
              onClick={() => setFilter(f => f === 'undecided' ? 'all' : 'undecided')}
              active={filter === 'undecided'}
            />
          </StatStrip>
        ) : undefined}
        primary={
          cards.length === 0 ? (
            <div className="flex flex-col items-center gap-3 overflow-hidden rounded-[27px] bg-card p-10 text-center shadow-lg">
              <IconUsers size={48} className="text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">
                {tx('Noch keine Umfrage. Lege Titel, Ort und Terminvorschläge an — danach bekommst du einen Link und QR-Code zum Teilen.')}
              </p>
              {crud.umfragen.canWrite && (
                <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>{tx('Erste Umfrage anlegen')}</Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {shown.length === 0 && (
                <p className="text-sm text-muted-foreground">{tx('Keine Umfrage in dieser Ansicht.')}</p>
              )}
              {shown.map(({ u, counts, top, people, closed, hasFinal }) => {
                const finish = !hasFinal ? flowActionFor('umfragen', 'status', u.record_id, 'geschlossen') : null;
                return (
                  <section key={u.record_id} className="min-w-0 space-y-3 overflow-hidden rounded-[27px] bg-card p-5 shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" className="min-w-0 text-left" onClick={() => crud.umfragen.openDetail(u)}>
                        <h2 className="truncate text-lg font-semibold">{u.fields.titel ?? appLabel('umfragen')}</h2>
                        {u.fields.ort && (
                          <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                            <IconMapPin size={14} className="shrink-0" />{u.fields.ort}
                          </p>
                        )}
                      </button>
                      <span className={`shrink-0 text-sm font-medium ${closed ? 'text-muted-foreground' : 'text-emerald-600'}`}>
                        {u.fields.status?.label}
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {countOf('antworten', people, appLabel('antworten'))} · {countOf('terminvorschlaege', counts.length, appLabel('terminvorschlaege'))}
                    </p>

                    {hasFinal && (
                      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                        <IconTrophy size={16} className="shrink-0" />
                        <span className="min-w-0 truncate">{tx('Final')}: {u.finaler_terminName}</span>
                      </p>
                    )}

                    <ul className="space-y-1.5">
                      {counts.map(c => {
                        const isTop = top?.termin.record_id === c.termin.record_id;
                        return (
                          <li
                            key={c.termin.record_id}
                            className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${isTop ? 'bg-emerald-100 text-emerald-900' : 'bg-muted/50'}`}
                          >
                            <span className="min-w-0 truncate">
                              {fmt(c.termin.fields.beginn)}–{fmtEnd(c.termin.fields.ende)}
                            </span>
                            <span className="shrink-0 whitespace-nowrap font-medium">
                              {c.ja} {tx('Ja')} · {c.vielleicht} {tx('Vielleicht')}
                            </span>
                          </li>
                        );
                      })}
                      {counts.length === 0 && (
                        <li className="text-sm text-muted-foreground">{tx('Noch keine Terminvorschläge.')}</li>
                      )}
                    </ul>

                    <div className="flex flex-wrap gap-2">
                      {finish && (
                        <Button size="sm" onClick={finish}>{tx('Finalen Termin festlegen')}</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => crud.umfragen.openDetail(u)}>{tx('Details')}</Button>
                    </div>

                    <RecordDoorLink page="termin-abstimmen" recordId={u.record_id} qr />
                  </section>
                );
              })}
            </div>
          )
        }
      />
      {crud.surfaces}
    </div>
  );
}
