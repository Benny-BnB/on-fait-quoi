// Quelques aéroports courants, uniquement pour pré-remplir la ville et le fuseau
// quand on tape un code dans le formulaire d'un vol. Tout reste modifiable.
export const AEROPORTS_CONNUS: Record<string, { ville: string; fuseau: string }> = {
  BRU: { ville: 'Bruxelles', fuseau: 'Europe/Brussels' },
  CRL: { ville: 'Charleroi', fuseau: 'Europe/Brussels' },
  CDG: { ville: 'Paris', fuseau: 'Europe/Paris' },
  AMS: { ville: 'Amsterdam', fuseau: 'Europe/Amsterdam' },
  AUH: { ville: 'Abu Dhabi', fuseau: 'Asia/Dubai' },
  DXB: { ville: 'Dubaï', fuseau: 'Asia/Dubai' },
  DWC: { ville: 'Dubaï (Al Maktoum)', fuseau: 'Asia/Dubai' },
  SHJ: { ville: 'Sharjah', fuseau: 'Asia/Dubai' },
  BKK: { ville: 'Bangkok', fuseau: 'Asia/Bangkok' },
  DMK: { ville: 'Bangkok (Don Mueang)', fuseau: 'Asia/Bangkok' },
  KBV: { ville: 'Krabi', fuseau: 'Asia/Bangkok' },
  HKT: { ville: 'Phuket', fuseau: 'Asia/Bangkok' },
  USM: { ville: 'Koh Samui', fuseau: 'Asia/Bangkok' },
  CNX: { ville: 'Chiang Mai', fuseau: 'Asia/Bangkok' },
  UTP: { ville: 'Pattaya (U-Tapao)', fuseau: 'Asia/Bangkok' },
};
