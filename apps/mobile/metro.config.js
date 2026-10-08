const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite uses WebAssembly when running on the web.
// Metro needs to recognize .wasm files as assets.
if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}

// expo-sqlite on web uses SharedArrayBuffer.
// These headers enable the required cross-origin isolation
// while running the Expo development server.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader(
      "Cross-Origin-Embedder-Policy",
      "credentialless"
    );

    res.setHeader(
      "Cross-Origin-Opener-Policy",
      "same-origin"
    );

    return middleware(req, res, next);
  };
};

module.exports = config;