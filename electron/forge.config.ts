import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";

const config = {
  packagerConfig: {
    name: "OpenClaw",
    executableName: "openclaw",
    icon: "./assets/chrome-extension/icons/icon128",
    asar: true,
    appBundleId: "ai.openclaw.desktop",
    appCategoryType: "public.app-category.developer-tools",
    extraResource: ["./dist/control-ui"],
  },
  makers: [
    new MakerZIP({}, ["darwin", "linux", "win32"]),
    new MakerDMG({
      format: "ULFO",
      background: "./assets/dmg-background.png",
    }),
  ],
};

export default config;
