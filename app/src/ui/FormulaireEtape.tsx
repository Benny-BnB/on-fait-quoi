import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerEtape, supprimerEtape, useStore } from '../data/store.ts';
import type { Etape } from '../data/types.ts';
import { etapesTriees, nbNuits } from '../lib/sejour.ts';
import { dateValide, fuseauValide, listeFuseaux } from '../lib/temps.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { aller } from './routeur.ts';

function nettoyer(e: Etape): Etape {
  return { ...e, nom: e.nom.trim(), pays: e.pays.trim(), devise: e.devise.trim().toUpperCase(), fuseau: e.fuseau.trim() };
}

function erreursEtape(e: Etape): string[] {
  const erreurs: string[] = [];
  if (!e.nom) erreurs.push("Donne un nom à l'étape.");
  if (e.devise !== '' && !/^[A-Z]{3}$/.test(e.devise)) erreurs.push('La devise doit avoir 3 lettres (exemple : THB).');
  if (!fuseauValide(e.fuseau)) erreurs.push('Fuseau horaire inconnu (exemple : Asia/Bangkok).');
  if (!dateValide(e.debut)) erreurs.push("Date d'arrivée manquante ou invalide.");
  if (!dateValide(e.fin)) erreurs.push('Date de départ manquante ou invalide.');
  if (dateValide(e.debut) && dateValide(e.fin) && e.fin < e.debut) erreurs.push("Le départ ne peut pas être avant l'arrivée.");
  return erreurs;
}

function Editeur(props: { initial: Etape; nouveau: boolean; nbLogements: number }) {
  const [etape, definirEtape] = useState<Etape>(props.initial);
  const [tentative, definirTentative] = useState(false); // vrai après un premier essai d'enregistrement
  const [fuseaux] = useState<string[]>(listeFuseaux);
  const maj = (partiel: Partial<Etape>) => definirEtape((e) => ({ ...e, ...partiel }));

  const propre = nettoyer(etape);
  const problemes = erreursEtape(propre);

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerEtape(propre);
    aller('#/sejour');
  }

  const nuits = dateValide(propre.debut) && dateValide(propre.fin) && propre.fin >= propre.debut ? nbNuits(propre.debut, propre.fin) : null;

  return (
    <Page titre={props.nouveau ? 'Nouvelle étape' : "Modifier l'étape"} retour={{ href: '#/sejour', libelle: 'Séjour' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? problemes : []} />
        <Champ etiquette="Nom de l'étape">
          <input type="text" value={etape.nom} placeholder="Bangkok" onInput={(e) => maj({ nom: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Pays (facultatif)">
          <input type="text" value={etape.pays} onInput={(e) => maj({ pays: e.currentTarget.value })} />
        </Champ>
        <div class="rangee-champs">
          <Champ etiquette="Arrivée">
            <input type="date" value={etape.debut} onInput={(e) => maj({ debut: e.currentTarget.value })} />
          </Champ>
          <Champ etiquette="Départ">
            <input type="date" value={etape.fin} onInput={(e) => maj({ fin: e.currentTarget.value })} />
          </Champ>
        </div>
        {nuits !== null && <div class="message info">{nuits} nuit{nuits > 1 ? 's' : ''} sur place</div>}
        <Champ etiquette="Fuseau horaire" aide="Celui de cette étape. Il servira au planning.">
          <input
            type="text"
            list="liste-fuseaux-etape"
            value={etape.fuseau}
            placeholder="Asia/Bangkok"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => maj({ fuseau: e.currentTarget.value })}
          />
        </Champ>
        <datalist id="liste-fuseaux-etape">
          {fuseaux.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <Champ etiquette="Devise (facultatif)" aide="Code à 3 lettres : THB, AED, EUR…">
          <input type="text" value={etape.devise} maxLength={3} placeholder="THB" autocomplete="off" spellcheck={false} onInput={(e) => maj({ devise: e.currentTarget.value })} />
        </Champ>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
        <a class="bouton secondaire" href="#/sejour">
          Annuler
        </a>
        {!props.nouveau && (
          <BoutonConfirme
            libelle="Supprimer cette étape"
            question={
              props.nbLogements > 0
                ? `Supprimer cette étape et ses ${props.nbLogements} logement${props.nbLogements > 1 ? 's' : ''} ? C'est définitif.`
                : 'Supprimer cette étape ? C\'est définitif.'
            }
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerEtape(props.initial.id);
              aller('#/sejour');
            }}
          />
        )}
      </form>
    </Page>
  );
}

export function FormulaireEtape(props: { id: string }) {
  const { donnees } = useStore();
  const nouveau = props.id === 'nouveau';
  const existante = nouveau ? undefined : donnees.etapes.find((e) => e.id === props.id);
  if (!nouveau && !existante) {
    return (
      <Page titre="Étape introuvable" retour={{ href: '#/sejour', libelle: 'Séjour' }}>
        <section class="carte">
          <p>Cette étape n'existe pas (ou a été supprimée).</p>
        </section>
      </Page>
    );
  }
  // Une nouvelle étape commence par défaut le jour où la précédente se termine
  const derniere = etapesTriees(donnees.etapes).at(-1);
  const vide: Etape = { id: nouvelId('etape'), nom: '', pays: '', devise: '', fuseau: '', debut: derniere?.fin ?? '', fin: '' };
  const nbLogements = donnees.logements.filter((l) => l.etapeId === props.id).length;
  return <Editeur key={props.id} initial={existante ?? vide} nouveau={nouveau} nbLogements={nbLogements} />;
}
