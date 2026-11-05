// La version web publiée sur GitHub Pages vit sous un sous-dossier ; le développement local reste à la racine.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL || '' },
});
