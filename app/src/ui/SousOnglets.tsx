// Bascule entre les deux écrans de l'onglet Transports
export function SousOnglets(props: { actif: 'vols' | 'trajets' }) {
  return (
    <div class="segments" role="group" aria-label="Transports">
      <a href="#/vols" class={props.actif === 'vols' ? 'actif' : ''} aria-current={props.actif === 'vols' ? 'page' : undefined}>
        Vols
      </a>
      <a href="#/trajets" class={props.actif === 'trajets' ? 'actif' : ''} aria-current={props.actif === 'trajets' ? 'page' : undefined}>
        Trajets
      </a>
    </div>
  );
}
