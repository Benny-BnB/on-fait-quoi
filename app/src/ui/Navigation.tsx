import type { ComponentChildren } from 'preact';
import type { Route } from './routeur.ts';

type Onglet = 'accueil' | 'planning' | 'sejour' | 'transports' | 'taches' | 'reglages';

function Icone(props: { children: ComponentChildren }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {props.children}
    </svg>
  );
}

const ONGLETS: { cle: Onglet; href: string; libelle: string; icone: ComponentChildren }[] = [
  {
    cle: 'accueil',
    href: '#/',
    libelle: 'Accueil',
    icone: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    cle: 'planning',
    href: '#/planning',
    libelle: 'Planning',
    icone: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
  },
  {
    cle: 'sejour',
    href: '#/sejour',
    libelle: 'Séjour',
    icone: (
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
  },
  {
    cle: 'transports',
    href: '#/vols',
    libelle: 'Transports',
    icone: (
      <>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </>
    ),
  },
  {
    cle: 'taches',
    href: '#/taches',
    libelle: 'Check-lists',
    icone: (
      <>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    cle: 'reglages',
    href: '#/reglages',
    libelle: 'Réglages',
    icone: (
      <>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </>
    ),
  },
];

function ongletActif(route: Route): Onglet {
  if (route.nom === 'vols' || route.nom === 'vol' || route.nom === 'trajets' || route.nom === 'trajet') return 'transports';
  if (route.nom === 'etape' || route.nom === 'logement' || route.nom === 'pratique' || route.nom === 'pratique-fiche' || route.nom === 'pratique-form') return 'sejour';
  if (route.nom === 'jour' || route.nom === 'creneau' || route.nom === 'quoi-faire' || route.nom === 'lieu' || route.nom === 'lieu-form') return 'planning';
  if (route.nom === 'a-completer') return 'accueil';
  if (route.nom === 'personnes' || route.nom === 'groupes' || route.nom === 'taux' || route.nom === 'budget' || route.nom === 'rythme') return 'reglages';
  if (route.nom === 'taches' || route.nom === 'emporter' || route.nom === 'tache') return 'taches';
  if (route.nom === 'compteurs' || route.nom === 'compteur') return 'accueil'; // les compteurs se règlent depuis l'accueil
  return route.nom;
}

export function Navigation(props: { route: Route }) {
  const actif = ongletActif(props.route);
  return (
    <nav class="navigation" aria-label="Navigation principale">
      {ONGLETS.map((o) => (
        <a key={o.cle} href={o.href} class={o.cle === actif ? 'actif' : ''} aria-current={o.cle === actif ? 'page' : undefined}>
          <Icone>{o.icone}</Icone>
          <span>{o.libelle}</span>
        </a>
      ))}
    </nav>
  );
}
