export type PanelHeaderMeta = {
  num: string;
  eyebrow: string;
  title: string;
};

export type PanelHeaderProps = {
  meta: PanelHeaderMeta;
};

export function PanelHeader({ meta }: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <span className="font-display text-mark font-bold leading-[0.78] tracking-[0] radar-hero-mark [font-stretch:75%] max-[1180px]:text-mark">
        {meta.num.replace(/(\d)$/, "")}
        <em className="not-italic text-signal [-webkit-text-stroke:0]">{meta.num.slice(-1)}</em>
      </span>
      <div>
        <span className="mb-1 block font-mono text-micro font-semibold uppercase tracking-banner text-signal">
          {meta.eyebrow}
        </span>
        <h2 className="font-display text-head font-semibold uppercase leading-none tracking-[0] text-bone [font-stretch:75%]">
          {meta.title}
        </h2>
      </div>
    </div>
  );
}
