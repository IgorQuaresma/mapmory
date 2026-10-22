import { LABEL_LANGUAGES, LAYER_KEYS, PALETTE_KEYS, type LabelLanguage, type PaletteKey } from '@mapmory/design-schema';
import { applyTheme } from '@mapmory/poster-core';
import { THEME_LIST } from '@mapmory/themes';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Callout, ColorField, Field, SectionTitle, Select, Slider, Switch, cx } from '../../../components/ui';
import { useDesign } from '../../../store/editor';
import { gesture, replaceDesign, setLayer, setPaletteColor, updateMap } from '../actions';
import { ThemeSwatch } from '../ThemeSwatch';

export function StylePanel() {
  const { t } = useTranslation();
  const design = useDesign();
  const { map } = design;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="style-themes">
        <SectionTitle>
          <span id="style-themes">{t('editor.style.themes')}</span>
        </SectionTitle>
        <div role="radiogroup" aria-labelledby="style-themes" className="grid grid-cols-4 gap-2">
          {THEME_LIST.map((theme) => {
            const selected = theme.id === map.themeId;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={selected}
                title={theme.description}
                onClick={() => replaceDesign((d) => applyTheme(d, theme.id))}
                className={cx(
                  'group relative flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] font-medium transition',
                  selected ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-ink-soft',
                )}
                data-testid={`theme-${theme.id}`}
              >
                <ThemeSwatch theme={theme} />
                <span className="truncate">{t(`themes.${theme.id}`)}</span>
                {selected && (
                  <span className="absolute right-1 top-1 rounded-full bg-ink p-0.5 text-white">
                    <Check aria-hidden className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.style.colors')}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {PALETTE_KEYS.map((key: PaletteKey) => (
            <ColorField
              key={key}
              label={t(`editor.style.palette.${key}`)}
              value={map.palette[key]}
              onChange={(hex) => setPaletteColor(key, hex)}
              onGestureStart={gesture.start}
              onGestureEnd={gesture.end}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('editor.style.layers')}</SectionTitle>
        {LAYER_KEYS.map((key) => (
          <Switch
            key={key}
            label={t(`editor.style.layer.${key}`)}
            checked={map.layers[key]}
            onChange={(v) => setLayer(key, v)}
          />
        ))}
        {map.layers.labels && <Callout tone="info">{t('editor.style.labelsNote')}</Callout>}
      </section>

      <section className="flex flex-col gap-4">
        <Field label={t('editor.style.labelLanguage')}>
          {({ id }) => (
            <Select<LabelLanguage>
              id={id}
              value={map.labelLanguage}
              onChange={(v) => updateMap({ labelLanguage: v })}
              options={LABEL_LANGUAGES.map((l) => ({ value: l, label: t(`languages.${l}`) }))}
            />
          )}
        </Field>
        <Slider
          label={t('editor.style.roadWeight')}
          value={map.roadWeight}
          min={0.25}
          max={3}
          step={0.05}
          format={(v) => `${Math.round(v * 100)} %`}
          onChange={(v) => updateMap({ roadWeight: v })}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
        />
      </section>
    </div>
  );
}
