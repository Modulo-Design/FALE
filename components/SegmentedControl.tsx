"use client";

/**
 * A small two-or-three button filter.
 *
 * The standings, head-to-head and all-time stats pages all gained a scope
 * filter at once; sharing one control is what keeps them looking and behaving
 * identically instead of drifting into three near-misses.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown as a tooltip; useful where the label has to stay short. */
  title?: string;
}

interface Props<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Labels the group for screen readers, e.g. "Scope". */
  label?: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden"
    >
      {options.map((option, idx) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            idx > 0 ? "border-l border-gray-300 dark:border-gray-600" : ""
          } ${
            option.value === value
              ? "bg-green-600 text-white"
              : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
