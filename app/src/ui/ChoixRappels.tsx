// Pastilles pour choisir les rappels (alertes) à mettre dans l'agenda

export const OPTIONS_RAPPEL: { minutes: number; libelle: string }[] = [
  { minutes: 1440, libelle: '1 jour avant' },
  { minutes: 180, libelle: '3 h avant' },
  { minutes: 60, libelle: '1 h avant' },
  { minutes: 30, libelle: '30 min avant' },
  { minutes: 15, libelle: '15 min avant' },
];

export function ChoixRappels(props: { valeur: number[]; onChange: (v: number[]) => void; legende: string }) {
  const bascule = (m: number) => props.onChange(props.valeur.includes(m) ? props.valeur.filter((x) => x !== m) : [...props.valeur, m]);
  return (
    <div class="chips" role="group" aria-label={props.legende}>
      {OPTIONS_RAPPEL.map((o) => (
        <label class={`chip${props.valeur.includes(o.minutes) ? ' choisi' : ''}`} key={o.minutes}>
          <input type="checkbox" checked={props.valeur.includes(o.minutes)} onChange={() => bascule(o.minutes)} />
          <span>{o.libelle}</span>
        </label>
      ))}
    </div>
  );
}
