import { Hotel } from '@/types';

export interface HotelVisual {
  src: string;
  fallbackSrc: string;
  label: string;
  sourceUrl: string;
}

const VISUALS: Record<string, HotelVisual> = {
  broomfield: {
    src: '/hotel-scenes/photos/broomfield.png',
    fallbackSrc: '/hotel-scenes/broomfield.svg',
    label: 'Mountain stay',
    sourceUrl: 'https://www.skyscanner.com/hotels/united-states/colorado-hotels/omni-interlocken-hotel/ht-148306513',
  },
  freudenstadt: {
    src: '/hotel-scenes/photos/freudenstadt.png',
    fallbackSrc: '/hotel-scenes/freudenstadt.svg',
    label: 'Black Forest',
    sourceUrl: 'https://www.bestwestern.de/en/hotels/Freudenstadt/Wellnesshotel-Palmenwald-Schwarzwald/hotel',
  },
  bangkok: {
    src: '/hotel-scenes/photos/bangkok.png',
    fallbackSrc: '/hotel-scenes/bangkok.svg',
    label: 'Skyline pool',
    sourceUrl: 'https://www.avanihotels.com/en/riverside-bangkok/gallery',
  },
  monterey: {
    src: '/hotel-scenes/photos/monterey.png',
    fallbackSrc: '/hotel-scenes/monterey.svg',
    label: 'Oceanfront',
    sourceUrl: 'https://montereyplazahotel.com/gallery',
  },
  'new smyrna beach': {
    src: '/hotel-scenes/photos/new-smyrna-beach.png',
    fallbackSrc: '/hotel-scenes/new-smyrna-beach.svg',
    label: 'Beach escape',
    sourceUrl: 'https://www.casagonsb.com/beaches/',
  },
  rome: {
    src: '/hotel-scenes/photos/rome.webp',
    fallbackSrc: '/hotel-scenes/rome.svg',
    label: 'Historic stay',
    sourceUrl: 'https://www.expedia.com/Rome.dx179899',
  },
  pompei: {
    src: '/hotel-scenes/photos/pompei.png',
    fallbackSrc: '/hotel-scenes/rome.svg',
    label: 'Historic stay',
    sourceUrl: 'https://www.ricksteves.com/watch-read-listen/read/articles/pompeii-italy',
  },
  pompeii: {
    src: '/hotel-scenes/photos/pompei.png',
    fallbackSrc: '/hotel-scenes/rome.svg',
    label: 'Historic stay',
    sourceUrl: 'https://www.ricksteves.com/watch-read-listen/read/articles/pompeii-italy',
  },
  bochum: {
    src: '/hotel-scenes/photos/bochum.png',
    fallbackSrc: '/hotel-scenes/bochum.svg',
    label: 'Business stay',
    sourceUrl: 'https://www.mycityhunt.com/explorer-blog/10-facts-about-bochum-you-didnt-know-569',
  },
  'san isidro de el general': {
    src: '/hotel-scenes/photos/san-isidro.png',
    fallbackSrc: '/hotel-scenes/san-isidro.svg',
    label: 'Tropical courtyard',
    sourceUrl: 'https://costarica.org/cities/san-isidro/',
  },
  mbombela: {
    src: '/hotel-scenes/photos/mbombela.png',
    fallbackSrc: '/hotel-scenes/mbombela.svg',
    label: 'Safari lodge',
    sourceUrl: 'https://www.tripadvisor.com/Hotel_Review-g312633-d23690861-Reviews-The_Capital_Mbombela-Mbombela_Mpumalanga.html',
  },
  frisco: {
    src: '/hotel-scenes/photos/frisco.jpg',
    fallbackSrc: '/hotel-scenes/suburban-us.svg',
    label: 'Urban district',
    sourceUrl: 'https://www.kimley-horn.com/location/frisco-tx/',
  },
  'bell gardens': {
    src: '/hotel-scenes/photos/bell-gardens.png',
    fallbackSrc: '/hotel-scenes/suburban-us.svg',
    label: 'Landmark stay',
    sourceUrl: 'https://www.tripadvisor.com/Hotel_Review-g34496-d23130616-Reviews-The_Equestrian_Hotel-Ocala_Florida.html',
  },
  ocala: {
    src: '/hotel-scenes/photos/ocala.png',
    fallbackSrc: '/hotel-scenes/suburban-us.svg',
    label: 'Landmark stay',
    sourceUrl: 'https://www.tripadvisor.com/Hotel_Review-g34496-d23130616-Reviews-The_Equestrian_Hotel-Ocala_Florida.html',
  },
};

const COUNTRY_FALLBACKS: Record<string, HotelVisual> = {
  'united states': VISUALS.frisco,
  germany: VISUALS.bochum,
  thailand: VISUALS.bangkok,
  italy: VISUALS.rome,
  'costa rica': VISUALS['san isidro de el general'],
  'south africa': VISUALS.mbombela,
};

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getHotelVisual(hotel: Pick<Hotel, 'city' | 'country'>): HotelVisual {
  const city = normalize(hotel.city);
  const country = normalize(hotel.country);

  if (city && VISUALS[city]) {
    return VISUALS[city];
  }

  if (country && COUNTRY_FALLBACKS[country]) {
    return COUNTRY_FALLBACKS[country];
  }

  return {
    src: '/hotel-scenes/suburban-us.svg',
    fallbackSrc: '/hotel-scenes/suburban-us.svg',
    label: 'Hotel stay',
    sourceUrl: '',
  };
}
