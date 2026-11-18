/**
 * Umfrage abschließen — 3-Schritt-Wizard.
 * Steps: 1) Offene Umfrage wählen → 2) Finalen Termin aus den Vorschlägen wählen → 3) Prüfen & schließen.
 * Reads: umfragen, terminvorschlaege. Writes: umfragen (update: finaler_termin, status=geschlossen).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useCallback, useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldDate, fieldLookup, fieldRef, fieldText } from '@/lib/journey';
import type { JourneyRecord } from '@/lib/journey';
import { useUmfrageAbschliessenFlow } from '@/lib/journey/flows/UmfrageAbschliessen';
import { tx } from '@/i18n';

function fmt(iso: string | null): string {
  if (!iso) return '';
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}${t ? ` ${t.slice(0, 5)}` : ''}`;
}

export default function UmfrageAbschliessenPage() {
  const [step, setStep] = useState(1);
  const [umfrageId, setUmfrageId] = useState<string | null>(null);

  const termineDerUmfrage = useCallback(
    (r: JourneyRecord) => !umfrageId || fieldRef(r, 'umfrage') === umfrageId,
    [umfrageId],
  );
  const offeneUmfragen = useCallback(
    (r: JourneyRecord) => fieldLookup(r, 'status')?.key !== 'geschlossen',
    [],
  );

  const flow = useUmfrageAbschliessenFlow({
    steps: { umfragen: 1, finaler_termin: 2 },
    items: {
      umfragen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: fieldText(r, 'ort') || undefined,
        status: fieldLookup(r, 'status') ?? undefined,
      }),
      finaler_termin: r => {
        const von = fmt(fieldDate(r, 'beginn'));
        const bis = fmt(fieldDate(r, 'ende'));
        return { id: r.id, title: von, subtitle: bis ? tx`bis ${bis}` : undefined };
      },
    },
    where: { finaler_termin: termineDerUmfrage, umfragen: offeneUmfragen },
  });

  const umfragePick = flow.pick('umfragen');
  const terminPick = flow.pick('finaler_termin');

  return (
    <IntentWizardShell
      title={tx('Umfrage abschließen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Wähle den finalen Termin und schließe die Umfrage.'),
        needs: [tx('Eine offene Umfrage mit Terminvorschlägen')],
      }}
    >
      <WizardStep label={tx('Umfrage')} description={tx('Welche offene Umfrage möchtest du abschließen?')}>
        <EntitySelectStep
          {...flow.picks.umfragen.select}
          {...umfragePick}
          onSelect={id => {
            setUmfrageId(id);
            umfragePick.onSelect(id);
          }}
          searchPlaceholder={tx('Titel oder Ort …')}
        />
      </WizardStep>
      <WizardStep label={tx('Finaler Termin')} description={tx('Welcher Terminvorschlag soll gelten?')}>
        {umfrageId ? (
          <EntitySelectStep
            {...flow.picks.finaler_termin.select}
            {...terminPick}
            emptyText={tx('Diese Umfrage hat keine Terminvorschläge.')}
            create={false}
          />
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'status', label: tx('Status'), value: tx('Geschlossen') }]}
            whatHappensNext={tx('Die Umfrage wird geschlossen, der gewählte Termin gilt als final.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          next={[
            { label: tx('Umfrage mit Terminen anlegen'), href: '#/intents/umfrage-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
