import { CheckCircle2, Route, ShieldQuestion } from "lucide-react";

export type TutorialLessonListProps = {
  title: string;
  items: string[];
  icon: "look" | "stronger" | "falsify";
};

export function TutorialLessonList({
  title,
  items,
  icon
}: TutorialLessonListProps) {
  if (items.length === 0) {
    return null;
  }
  const Icon = icon === "look" ? Route : icon === "stronger" ? CheckCircle2 : ShieldQuestion;
  return (
    <div className="border-l border-rule pl-3">
      <div className="flex items-center gap-2 rd-label text-muted">
        <Icon
          size={12}
          strokeWidth={1.7}
          className={icon === "falsify" ? "text-sand" : "text-signal"}
        />
        {title}
      </div>
      <ul className="mt-2 grid gap-1.5 text-meta leading-5 text-copy">
        {items.map((item) => (
          <li
            key={item}
            className="relative pl-3 before:absolute before:left-0 before:top-[9px] before:h-px before:w-1.5 before:bg-current"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
