export default {
  Mavo: {
    value: () => true,
    locale: 'cn',
    getCanonicalProperty: () => true,
    toArray: () => [],
    match: () => true,
    base: '',
    safeToJSON: () => {}
  },
  Bliss: {
    p: str => {
      console.log(str);
      return [];
    }
  },
  location: {
    hash: []
  }
};
