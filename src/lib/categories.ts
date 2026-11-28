/**
 * Photography categories for albums (and suggestions for the main page's
 * "Type and year" field). The built-in list lives here; categories added in
 * the Studio are stored in the database and appear in the "custom" group.
 *
 * Ids are stored on albums, so never rename an existing id. Labels can change.
 */

export const CATEGORY_GROUPS = [
  { id: 'celebrations', es: 'Celebraciones', en: 'Celebrations' },
  { id: 'people', es: 'Personas', en: 'People' },
  { id: 'events', es: 'Eventos', en: 'Events' },
  { id: 'commercial', es: 'Comercial', en: 'Commercial' },
  { id: 'places', es: 'Naturaleza y lugares', en: 'Nature and places' },
  { id: 'art', es: 'Arte y documental', en: 'Art and documentary' },
  { id: 'custom', es: 'Mis categorías', en: 'My categories' },
] as const;

export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]['id'];

export interface Category {
  id: string;
  es: string;
  en: string;
  group: CategoryGroup;
}

const c = (group: CategoryGroup, list: [id: string, es: string, en: string][]): Category[] =>
  list.map(([id, es, en]) => ({ id, es, en, group }));

export const BUILTIN_CATEGORIES: Category[] = [
  ...c('celebrations', [
    ['wedding', 'Boda', 'Wedding'],
    ['civil-wedding', 'Boda civil', 'Civil wedding'],
    ['prewedding', 'Sesión preboda', 'Pre-wedding session'],
    ['engagement', 'Compromiso', 'Engagement'],
    ['proposal', 'Propuesta de matrimonio', 'Proposal'],
    ['xv', 'XV años', 'XV años'],
    ['sweet-sixteen', 'Dulces 16', 'Sweet sixteen'],
    ['baptism', 'Bautizo', 'Baptism'],
    ['first-communion', 'Primera comunión', 'First communion'],
    ['confirmation', 'Confirmación', 'Confirmation'],
    ['baby-shower', 'Baby shower', 'Baby shower'],
    ['gender-reveal', 'Revelación de género', 'Gender reveal'],
    ['birthday', 'Cumpleaños', 'Birthday'],
    ['kids-party', 'Fiesta infantil', "Kids' party"],
    ['graduation', 'Graduación', 'Graduation'],
    ['anniversary', 'Aniversario', 'Anniversary'],
    ['vow-renewal', 'Renovación de votos', 'Vow renewal'],
    ['religious', 'Ceremonia religiosa', 'Religious ceremony'],
  ]),
  ...c('people', [
    ['portrait', 'Sesión de retrato', 'Portrait session'],
    ['family', 'Sesión familiar', 'Family session'],
    ['couple', 'Sesión de pareja', 'Couple session'],
    ['maternity', 'Maternidad', 'Maternity'],
    ['newborn', 'Recién nacido', 'Newborn'],
    ['kids', 'Infantil', 'Children'],
    ['smash-cake', 'Smash cake', 'Smash cake'],
    ['class-portraits', 'Fotos de promoción', 'Graduation portraits'],
    ['headshot', 'Retrato profesional', 'Headshots'],
    ['personal-branding', 'Marca personal', 'Personal branding'],
    ['fashion', 'Moda', 'Fashion'],
    ['model-portfolio', 'Book de modelo', 'Model portfolio'],
    ['beauty', 'Belleza y maquillaje', 'Beauty and makeup'],
    ['boudoir', 'Boudoir', 'Boudoir'],
    ['fitness', 'Fitness', 'Fitness'],
    ['cosplay', 'Cosplay', 'Cosplay'],
    ['artist', 'Artistas y músicos', 'Artists and musicians'],
    ['pets', 'Mascotas', 'Pets'],
    ['equestrian', 'Caballos', 'Equestrian'],
  ]),
  ...c('events', [
    ['event', 'Evento', 'Event'],
    ['corporate-event', 'Evento corporativo', 'Corporate event'],
    ['conference', 'Conferencia', 'Conference'],
    ['launch', 'Lanzamiento', 'Launch'],
    ['party', 'Fiesta', 'Party'],
    ['prom', 'Fiesta de graduación', 'Prom'],
    ['concert', 'Concierto', 'Concert'],
    ['festival', 'Festival', 'Festival'],
    ['nightlife', 'Vida nocturna', 'Nightlife'],
    ['theater', 'Teatro', 'Theater'],
    ['dance', 'Danza', 'Dance'],
    ['sports', 'Deportes', 'Sports'],
    ['motorsport', 'Automovilismo', 'Motorsport'],
    ['school', 'Evento escolar', 'School event'],
    ['church', 'Evento de iglesia', 'Church event'],
    ['tradition', 'Fiestas patronales', 'Local festivities'],
  ]),
  ...c('commercial', [
    ['commercial', 'Sesión comercial', 'Commercial shoot'],
    ['product', 'Producto', 'Product'],
    ['catalog', 'Catálogo', 'Catalog'],
    ['food', 'Gastronomía', 'Food'],
    ['drinks', 'Bebidas', 'Drinks'],
    ['jewelry', 'Joyería', 'Jewelry'],
    ['brand', 'Contenido para marcas', 'Brand content'],
    ['social-media', 'Redes sociales', 'Social media'],
    ['advertising', 'Publicidad', 'Advertising'],
    ['corporate', 'Corporativo', 'Corporate'],
    ['team', 'Equipo de trabajo', 'Team photos'],
    ['real-estate', 'Bienes raíces', 'Real estate'],
    ['interiors', 'Interiores', 'Interiors'],
    ['architecture', 'Arquitectura', 'Architecture'],
    ['construction', 'Construcción', 'Construction'],
    ['hospitality', 'Hoteles y turismo', 'Hotels and tourism'],
    ['restaurant', 'Restaurantes', 'Restaurants'],
    ['automotive', 'Automotriz', 'Automotive'],
    ['industrial', 'Industrial', 'Industrial'],
  ]),
  ...c('places', [
    ['landscape', 'Paisaje', 'Landscape'],
    ['nature', 'Naturaleza', 'Nature'],
    ['wildlife', 'Vida silvestre', 'Wildlife'],
    ['birds', 'Aves', 'Birds'],
    ['macro', 'Macro', 'Macro'],
    ['flowers', 'Flores y plantas', 'Flowers and plants'],
    ['seascape', 'Mar y playa', 'Sea and beach'],
    ['volcanoes', 'Volcanes y montañas', 'Volcanoes and mountains'],
    ['astro', 'Astrofotografía', 'Astrophotography'],
    ['night', 'Nocturna', 'Night'],
    ['aerial', 'Aérea y dron', 'Aerial and drone'],
    ['underwater', 'Submarina', 'Underwater'],
    ['travel', 'Viajes', 'Travel'],
    ['urban', 'Ciudad', 'Cityscape'],
  ]),
  ...c('art', [
    ['street', 'Callejera', 'Street'],
    ['documentary', 'Documental', 'Documentary'],
    ['photojournalism', 'Fotoperiodismo', 'Photojournalism'],
    ['culture', 'Cultura y tradiciones', 'Culture and traditions'],
    ['editorial', 'Editorial', 'Editorial'],
    ['fine-art', 'Arte', 'Fine art'],
    ['conceptual', 'Conceptual', 'Conceptual'],
    ['black-and-white', 'Blanco y negro', 'Black and white'],
    ['minimalist', 'Minimalista', 'Minimalist'],
    ['abstract', 'Abstracta', 'Abstract'],
    ['still-life', 'Bodegón', 'Still life'],
    ['film', 'Analógica', 'Film photography'],
    ['long-exposure', 'Larga exposición', 'Long exposure'],
  ]),
];

/** The fallback for albums without a category, or whose category was removed. */
export const OTHER: Category = { id: 'other', es: 'Sesión', en: 'Session', group: 'custom' };

export const BUILTIN_IDS = new Set([...BUILTIN_CATEGORIES.map((x) => x.id), OTHER.id]);

export function categoryLabel(id: string, locale: string, all: Category[] = BUILTIN_CATEGORIES): string {
  const cat = all.find((x) => x.id === id) ?? (id === OTHER.id ? OTHER : undefined);
  if (!cat) return locale === 'en' ? OTHER.en : OTHER.es;
  return locale === 'en' && cat.en.trim() ? cat.en : cat.es;
}

/** Categories grouped in display order; empty groups are left out. */
export function groupCategories(all: Category[]) {
  return CATEGORY_GROUPS.map((g) => ({ ...g, items: all.filter((x) => x.group === g.id) })).filter((g) => g.items.length);
}

/** URL-safe id from a Spanish label: "Fotografía de autos" becomes "fotografia-de-autos". */
export function slugify(label: string) {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
