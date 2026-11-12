// Pastilles à cocher pour choisir plusieurs valeurs d'une liste fermée (régimes, mobilité, transports…)
export function ChoixListe<T extends string>(props: { options: readonly T[]; libelles: Record<T, string>; valeur: T[]; onChange: (v: T[]) => void; legende?: string }) {
  const bascule = (o: T) => props.onChange(props.valeur.includes(o) ? props.valeur.filter((x) => x !== o) : [...props.valeur, o]);
  return (
    <div class="chips" role="group" aria-label={props.legende}>
      {props.options.map((o) => (
        <label class={`chip${props.valeur.includes(o) ? ' choisi' : ''}`} key={o}>
          <input type="checkbox" checked={props.valeur.includes(o)} onChange={() => bascule(o)} />
          <span>{props.libelles[o]}</span>
        </label>
      ))}
    </div>
  );
}
