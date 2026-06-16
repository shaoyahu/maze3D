import { useMemo } from 'react';
import { useTutorialStore } from '../../store/tutorialStore';
import { useT } from '../../i18n';

/**
 * P2-11: bottom-center HUD banner that surfaces the current tutorial step.
 *
 * Render condition (set by the caller in GameCanvas):
 *   `maze.tutorialSteps && maze.tutorialSteps.length > 0`
 *
 * Reads `currentStepId` from `useTutorialStore`. When null, the banner is
 * hidden — once the tutorial finishes (last step's trigger fires), the
 * store clears the id and the banner disappears without unmounting the
 * canvas. Listens to `useT()` for the step's message so language
 * switches re-render the banner.
 */
export function TutorialBanner() {
  const t = useT();
  const steps = useTutorialStore((s) => s.steps);
  const currentStepId = useTutorialStore((s) => s.currentStepId);

  const currentStep = useMemo(
    () => steps.find((s) => s.id === currentStepId) ?? null,
    [steps, currentStepId],
  );

  if (!currentStep) return null;

  const total = steps.length;
  const stepIndex = steps.findIndex((s) => s.id === currentStepId);
  const progressLabel = `${stepIndex + 1}/${total}`;

  return (
    <div style={bannerStyle} role="status" aria-live="polite" data-testid="tutorial-banner">
      <div style={progressChipStyle} aria-hidden data-testid="tutorial-progress">
        {progressLabel}
      </div>
      <div style={messageStyle} data-testid="tutorial-message">
        {t(currentStep.messageKey)}
      </div>
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 80,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '14px 22px',
  maxWidth: 640,
  background: 'rgba(8, 12, 22, 0.78)',
  color: '#fff',
  borderRadius: 10,
  fontSize: 16,
  lineHeight: 1.4,
  pointerEvents: 'none',
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
  zIndex: 60,
};

const progressChipStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.12)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'rgba(255, 255, 255, 0.85)',
  whiteSpace: 'nowrap',
};

const messageStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};