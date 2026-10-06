// DEVELOPMENT PLACEHOLDERS. The boards' placeholder people (design/BOARDS.md). Not
// production assets; the real source of these images is still undecided. Every use of
// assets/dev-placeholders goes through this module so the references are easy to find
// and replace. See assets/dev-placeholders/README.md.

export const DEV_WELCOME_COLLAGE: { offset: number; images: number[] }[] = [
  { offset: 0, images: [require('../../assets/dev-placeholders/maya_t1.jpg'), require('../../assets/dev-placeholders/putu_t.jpg'), require('../../assets/dev-placeholders/theo_t.jpg')] },
  { offset: 64, images: [require('../../assets/dev-placeholders/adam_t.jpg'), require('../../assets/dev-placeholders/hatwoman_t.jpg'), require('../../assets/dev-placeholders/maya_t2.jpg')] },
  { offset: 22, images: [require('../../assets/dev-placeholders/sofia_t.jpg'), require('../../assets/dev-placeholders/wayan_t.jpg'), require('../../assets/dev-placeholders/maya_t3.jpg')] },
];

export const DEV_INVITE_FACES: number[] = [
  require('../../assets/dev-placeholders/putu_a.jpg'),
  require('../../assets/dev-placeholders/maya_a.jpg'),
  require('../../assets/dev-placeholders/wayan_a.jpg'),
  require('../../assets/dev-placeholders/sofia_a.jpg'),
];

export const DEV_WAITLIST_FACES: number[] = [
  require('../../assets/dev-placeholders/putu_a.jpg'),
  require('../../assets/dev-placeholders/sofia_a.jpg'),
];
