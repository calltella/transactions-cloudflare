import { defineConfig, loadEnv } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_");
  for (const [key, value] of Object.entries(localEnv)) {
    process.env[key] ??= value;
  }
  return {
    plugins: [
      vinext({
        images: { optimizer: imagesOptimizer() },
      }),
      cloudflare({
        viteEnvironment: {
          name: "rsc",
          childEnvironments: ["ssr"],
        },
      }),
    ],
  };
});
