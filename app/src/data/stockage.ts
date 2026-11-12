// Enregistrement des données DANS le téléphone (IndexedDB). Rien ne part sur Internet.

const NOM_BASE = 'on-fait-quoi';
const NOM_MAGASIN = 'donnees';
const CLE = 'principal';

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const requete = indexedDB.open(NOM_BASE, 1);
    requete.onupgradeneeded = () => {
      requete.result.createObjectStore(NOM_MAGASIN);
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error ?? new Error('Ouverture impossible'));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (magasin: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const base = await ouvrir();
  return new Promise<T>((resolve, reject) => {
    const tx = base.transaction(NOM_MAGASIN, mode);
    const requete = action(tx.objectStore(NOM_MAGASIN));
    tx.oncomplete = () => {
      base.close();
      resolve(requete.result);
    };
    tx.onerror = () => {
      base.close();
      reject(tx.error ?? new Error('Écriture impossible'));
    };
    tx.onabort = () => {
      base.close();
      reject(tx.error ?? new Error('Écriture annulée'));
    };
  });
}

export function lirePrincipal<T>(): Promise<T | undefined> {
  return transaction<T | undefined>('readonly', (m) => m.get(CLE));
}

export async function ecrirePrincipal(valeur: unknown): Promise<void> {
  await transaction('readwrite', (m) => m.put(valeur, CLE));
}

// Autres petites données gardées dans le même magasin : dates de sauvegarde, copie d'avant le dernier import.
// « Tout supprimer » les efface aussi (effacerTout vide le magasin entier).
export const CLE_META = 'meta';
export const CLE_AVANT_IMPORT = 'avant-import';

export function lireCle<T>(cle: string): Promise<T | undefined> {
  return transaction<T | undefined>('readonly', (m) => m.get(cle));
}

export async function ecrireCle(cle: string, valeur: unknown): Promise<void> {
  await transaction('readwrite', (m) => m.put(valeur, cle));
}

export async function supprimerCle(cle: string): Promise<void> {
  await transaction('readwrite', (m) => m.delete(cle));
}

export async function effacerTout(): Promise<void> {
  await transaction('readwrite', (m) => m.clear());
}

// Demande au navigateur de ne pas effacer les données tout seul.
// Renvoie true (protégé), false (non garanti) ou null (le navigateur ne sait pas répondre).
export async function demanderStockagePersistant(): Promise<boolean | null> {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return null;
    if (await navigator.storage.persisted()) return true;
    if (navigator.storage.persist) return await navigator.storage.persist();
    return false;
  } catch {
    return null;
  }
}
