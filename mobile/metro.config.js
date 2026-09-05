const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const localNodeModules = path.resolve(projectRoot, "node_modules");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");

const config = getDefaultConfig(projectRoot);
const { assetExts, sourceExts } = config.resolver;

config.watchFolders = [workspaceRoot];

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer/expo")
};

config.resolver.disableHierarchicalLookup = false;
config.resolver.nodeModulesPaths = [localNodeModules, workspaceNodeModules];
config.resolver.assetExts = assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...sourceExts, "svg"];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  expo: path.join(localNodeModules, "expo"),
  react: path.join(localNodeModules, "react"),
  "react-native": path.join(localNodeModules, "react-native"),
  "react-native-gesture-handler": path.join(localNodeModules, "react-native-gesture-handler"),
  "react-native-safe-area-context": path.join(localNodeModules, "react-native-safe-area-context")
};

module.exports = config;
