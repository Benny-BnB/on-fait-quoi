import type { Personne } from '../data/types.ts';

// Choix des participants : une pastille par personne
export function ChoixParticipants(props: { personnes: Personne[]; valeur: string[]; onChange: (ids: string[]) => void }) {
  const bascule = (id: string) => props.onChange(props.valeur.includes(id) ? props.valeur.filter((x) => x !== id) : [...props.valeur, id]);
  if (props.personnes.length === 0) {
    return (
      <p class="discret">
        Aucune personne enregistrée. <a href="#/personnes">Ajoute les personnes du voyage</a> pour choisir qui participe.
      </p>
    );
  }
  return (
    <div class="chips">
      {props.personnes.map((p) => (
        <label class={`chip${props.valeur.includes(p.id) ? ' choisi' : ''}`} key={p.id}>
          <input type="checkbox" checked={props.valeur.includes(p.id)} onChange={() => bascule(p.id)} />
          <span>{p.prenom}</span>
        </label>
      ))}
    </div>
  );
}
