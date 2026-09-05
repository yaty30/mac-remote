// Installs a native-backed crypto.getRandomValues so the secure transport's
// nonce generation (@noble) works on Hermes, where WebCrypto is absent. Must
// run before any module that touches crypto.
import "react-native-get-random-values";

import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
