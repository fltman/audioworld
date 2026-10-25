import { helpHref } from '../help';

interface Props {
  /** Where in the docs: "section" or "section/anchor" (see admin/src/docs). */
  to: string;
  /** What it explains, for the tooltip ("Hjälp: …"). */
  label?: string;
}

/** A small "?" that opens the help at the part of the docs explaining this panel. */
export default function HelpLink({ to, label }: Props) {
  const title = label ? `Hjälp: ${label}` : 'Hjälp';
  return (
    <a className="help-link" href={helpHref(to)} title={title} aria-label={title}>
      ?
    </a>
  );
}
