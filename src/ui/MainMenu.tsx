import { Button } from './components/Button';
import { useT } from '../i18n';

export interface MainMenuProps {
  onStart: () => void;
  onSettings: () => void;
  onEditor?: () => void;
}

export function MainMenu({ onStart, onSettings, onEditor }: MainMenuProps) {
  const t = useT();
  return (
    <div className="home-shell" data-testid="main-menu-panel">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <h1 id="home-hero-title" className="home-hero__title">
          {t('app.menu.title')}
        </h1>
        <p className="home-hero__tagline">{t('app.menu.tagline')}</p>
        <div className="home-hero__cta">
          <Button
            onClick={onStart}
            hoverLift
            data-testid="main-menu-start"
          >
            ▶ {t('app.menu.start')}
          </Button>
          {onEditor && (
            <Button
              onClick={onEditor}
              variant="secondary"
              hoverLift
              data-testid="main-menu-editor"
            >
              {t('app.menu.editor')}
            </Button>
          )}
          <Button
            onClick={onSettings}
            variant="secondary"
            hoverLift
          >
            {t('app.menu.settings')}
          </Button>
        </div>
      </section>
    </div>
  );
}