const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite sur le web charge un fichier wasm. Son API asynchrone n'exige pas les en-têtes COOP et COEP.
config.resolver.assetExts.push('wasm');

module.exports = config;
